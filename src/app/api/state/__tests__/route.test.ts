import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getSqlite } from "@/db";
import { runMigrations } from "@/db/migrate";
import type { KitchenState, Recipe } from "@/lib/types";
import { GET, POST } from "../route";

// The connection opens on first use, so this lands before anything touches it.
process.env.DATABASE_PATH = ":memory:";

// Migration 0004 puts the built-in recipes in, before beforeEach empties the table.
let builtInIds: string[] = [];

beforeAll(() => {
  runMigrations();
  builtInIds = (getSqlite().prepare("SELECT id FROM custom_recipes ORDER BY rowid").all() as { id: string }[]).map((r) => r.id);
});

beforeEach(() => {
  for (const table of ["plan_entries", "custom_recipes", "settings", "checks", "pantry_items"]) {
    getSqlite().prepare(`DELETE FROM ${table}`).run();
  }
});

function post(body: unknown) {
  return POST(
    new Request("http://konben/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

async function state(): Promise<KitchenState> {
  return (await GET()).json();
}

const custom: Recipe = {
  id: "c1",
  name: "Chickpea stew",
  minutes: 30,
  servings: 4,
  macros: { kcal: 400, protein: 15, carbs: 50, fat: 12 },
  reheat: { quality: "great", how: "Better the next day." },
  ingredients: [{ item: "Chickpeas, tinned", qty: 400, unit: "g", aisle: "Pantry" }],
  steps: [{ title: "Simmer", actions: ["Simmer everything for 20 minutes."] }],
};

const night = (recipeId: string, cookFor: 1 | 2 = 1) => ({ recipeId, servings: 2, cookFor });

describe("POST /api/state rejects", () => {
  it("a body that isn't JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
  });

  it("a body that isn't sent as JSON, writing nothing", async () => {
    const res = await POST(
      new Request("http://konben/api/state", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ op: "goals.write", goals: { kcal: 1, protein: 1, carbs: 1, fat: 1 } }),
      })
    );
    expect(res.status).toBe(415);
    expect((await state()).goals.kcal).not.toBe(1);
  });

  it("an unknown op, saying so", async () => {
    const res = await post({ op: "plan.explode" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unrecognised change.");
  });

  it("an invalid recipe, naming the field", async () => {
    const res = await post({ op: "recipe.add", recipe: { ...custom, steps: [] } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("That recipe isn't valid.");
    expect(body.detail).toContain("recipe.steps");
  });

  it("a night planned with a recipe that doesn't exist, writing nothing", async () => {
    await post({ op: "recipe.add", recipe: custom });
    const res = await post({
      op: "plan.write",
      set: { "2026-09-21": night("c1"), "2026-09-22": night("ghost") },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('"ghost"');
    expect((await state()).plan).toEqual({});
  });

  it("an empty list of days to clear, rather than clearing every week", async () => {
    const res = await post({ op: "checks.clear", kind: "ticked", days: [] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/state writes", () => {
  it("starts a fresh kitchen with the thirteen built-in recipes", () => {
    expect(builtInIds).toEqual(Array.from({ length: 13 }, (_, i) => `r${i + 1}`));
  });

  it("plans a built-in recipe once it's a row, and removes nights", async () => {
    await post({ op: "recipe.add", recipe: custom });
    await post({ op: "recipe.add", recipe: { ...custom, id: "r1" } });
    await post({ op: "plan.write", set: { "2026-09-21": night("r1", 2), "2026-09-23": night("c1") } });
    await post({ op: "plan.write", remove: ["2026-09-23"] });

    expect((await state()).plan).toEqual({ "2026-09-21": night("r1", 2) });
  });

  it("upserts a recipe added again with the same id", async () => {
    await post({ op: "recipe.add", recipe: custom });
    await post({ op: "recipe.add", recipe: { ...custom, name: "Chickpea and chard stew" } });

    const { recipes: saved } = await state();
    expect(saved.map((r) => r.name)).toEqual(["Chickpea and chard stew"]);
  });

  it("drops a deleted recipe from every week it was planned in", async () => {
    await post({ op: "recipe.add", recipe: custom });
    await post({ op: "recipe.add", recipe: { ...custom, id: "r1" } });
    await post({
      op: "plan.write",
      set: { "2026-09-21": night("c1"), "2026-10-05": night("c1"), "2026-09-22": night("r1") },
    });
    await post({ op: "recipe.delete", id: "c1" });

    const s = await state();
    expect(s.recipes.map((r) => r.id)).toEqual(["r1"]);
    expect(Object.keys(s.plan)).toEqual(["2026-09-22"]);
  });

  it("edits a built-in recipe in place, with no rebuild", async () => {
    await post({ op: "recipe.add", recipe: { ...custom, id: "r5" } });
    await post({ op: "recipe.add", recipe: { ...custom, id: "r5", name: "Tofu peanut noodles" } });

    expect((await state()).recipes.map((r) => r.name)).toEqual(["Tofu peanut noodles"]);
  });

  it("lists built-in recipes after saved ones", async () => {
    getSqlite().prepare("INSERT INTO custom_recipes (id, data, created_at) VALUES ('r9', ?, 0)").run(JSON.stringify({ ...custom, id: "r9" }));
    await post({ op: "recipe.add", recipe: custom });

    expect((await state()).recipes.map((r) => r.id)).toEqual(["c1", "r9"]);
  });

  it("clears one week's ticks and packing, leaving other weeks alone", async () => {
    await post({
      op: "checks.write",
      set: [
        { key: "2026-09-21|red onion|", kind: "ticked" },
        { key: "2026-09-28|red onion|", kind: "ticked" },
        { key: "2026-09-23|Red onion", kind: "packed" },
        { key: "2026-09-30|Red onion", kind: "packed" },
      ],
    });
    const week = ["21", "22", "23", "24", "25", "26", "27"].map((d) => `2026-09-${d}`);
    await post({ op: "checks.clear", kind: "ticked", days: week });
    await post({ op: "checks.clear", kind: "packed", days: week });

    const s = await state();
    expect(Object.keys(s.ticked)).toEqual(["2026-09-28|red onion|"]);
    expect(Object.keys(s.packed)).toEqual(["2026-09-30|Red onion"]);
  });

  it("clears every week of one kind when no days are given", async () => {
    await post({
      op: "checks.write",
      set: [
        { key: "2026-09-21|red onion|", kind: "ticked" },
        { key: "2026-09-28|red onion|", kind: "ticked" },
        { key: "2026-09-23|Red onion", kind: "packed" },
      ],
    });
    await post({ op: "checks.clear", kind: "ticked" });

    const s = await state();
    expect(s.ticked).toEqual({});
    expect(Object.keys(s.packed)).toEqual(["2026-09-23|Red onion"]);
  });

  it("saves goals, overwriting the previous ones", async () => {
    await post({ op: "goals.write", goals: { kcal: 600, protein: 30, carbs: 60, fat: 20 } });
    await post({ op: "goals.write", goals: { kcal: 700, protein: 35, carbs: 70, fat: 25 } });

    expect((await state()).goals).toEqual({ kcal: 700, protein: 35, carbs: 70, fat: 25 });
  });
});

describe("the kitchen list", () => {
  it("keys an item by its plain name, so adding it again updates it", async () => {
    await post({ op: "pantry.add", item: "Zucchini", useBy: "2026-09-24" });
    await post({ op: "pantry.add", item: "zucchini", useBy: "2026-09-22" });

    expect((await state()).pantry).toEqual([{ key: "zucchini", item: "zucchini", useBy: "2026-09-22" }]);
  });

  it("keeps the use-by when an item is added again without one, and clears it on null", async () => {
    await post({ op: "pantry.add", item: "Feta", useBy: "2026-09-24" });
    await post({ op: "pantry.add", item: "Feta" });
    expect((await state()).pantry[0].useBy).toBe("2026-09-24");

    await post({ op: "pantry.add", item: "Feta", useBy: null });
    expect((await state()).pantry[0].useBy).toBeNull();
  });

  it("lists the soonest use-by first and undated things last", async () => {
    await post({ op: "pantry.add", item: "Rice" });
    await post({ op: "pantry.add", item: "Feta", useBy: "2026-09-28" });
    await post({ op: "pantry.add", item: "Baby spinach", useBy: "2026-09-22" });

    expect((await state()).pantry.map((p) => p.item)).toEqual(["Baby spinach", "Feta", "Rice"]);
  });

  it("removes items by key", async () => {
    await post({ op: "pantry.add", item: "Feta" });
    await post({ op: "pantry.add", item: "Red onions" });
    await post({ op: "pantry.remove", keys: ["red onion"] });

    expect((await state()).pantry.map((p) => p.key)).toEqual(["feta"]);
  });

  it("rejects a bad date, a blank name, and a name with nothing before the comma", async () => {
    expect((await post({ op: "pantry.add", item: "Feta", useBy: "Thursday" })).status).toBe(400);
    expect((await post({ op: "pantry.add", item: "   " })).status).toBe(400);
    expect((await post({ op: "pantry.add", item: ", tinned" })).status).toBe(400);
    expect((await state()).pantry).toEqual([]);
  });

  it("moves Monday-keyed shopping ticks to the Sunday before (migration 0006)", async () => {
    await post({
      op: "checks.write",
      set: [
        { key: "2026-10-12|red onion|", kind: "ticked" },
        { key: "2026-10-11|lime|", kind: "ticked" },
        { key: "2026-10-12|Red onion", kind: "packed" },
      ],
    });
    const sql = readFileSync("drizzle/0006_week_starts_sunday.sql", "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) getSqlite().exec(statement);

    const s = await state();
    expect(Object.keys(s.ticked).sort()).toEqual(["2026-10-11|lime|", "2026-10-11|red onion|"]);
    expect(Object.keys(s.packed)).toEqual(["2026-10-12|Red onion"]);
  });
});
