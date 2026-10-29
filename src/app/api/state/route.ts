import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSqlite } from "@/db";
import { checks, customRecipes, pantryItems, planEntries, settings } from "@/db/schema";
import { DEFAULT_GOALS } from "@/lib/constants";
import { Mutation } from "@/lib/mutations";
import { bySoonest, pantryKey } from "@/lib/planning";
import type { Goals, KitchenState, PantryItem, Plan, Recipe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const [planRows, recipeRows, settingRow, checkRows, pantryRows] = [
    db.select().from(planEntries).all(),
    // Built-in recipes carry created_at 0; saved ones keep going first.
    db.select().from(customRecipes).orderBy(sql`${customRecipes.createdAt} = 0`, sql`rowid`).all(),
    db.select().from(settings).where(eq(settings.id, 1)).get(),
    db.select().from(checks).all(),
    db.select().from(pantryItems).orderBy(pantryItems.createdAt).all(),
  ];

  const plan: Plan = {};
  for (const row of planRows) {
    plan[row.dateKey] = {
      recipeId: row.recipeId,
      servings: row.servings,
      cookFor: row.cookFor === 2 ? 2 : 1,
    };
  }

  const ticked: Record<string, boolean> = {};
  const packed: Record<string, boolean> = {};
  for (const row of checkRows) {
    (row.kind === "packed" ? packed : ticked)[row.key] = true;
  }

  const state: KitchenState = {
    plan,
    goals: (settingRow?.goals as Goals) ?? DEFAULT_GOALS,
    ticked,
    packed,
    recipes: recipeRows.map((row) => row.data as Recipe),
    pantry: pantryRows.map(({ key, item, useBy }): PantryItem => ({ key, item, useBy })).sort(bySoonest),
  };

  return NextResponse.json(state);
}

export async function POST(request: Request) {
  // Only JSON. A cross-site form or text/plain fetch skips the CORS preflight,
  // so without this any page open in a browser on the LAN could rewrite the plan.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Send the change as application/json." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const db = getDb();
  const parsed = Mutation.safeParse(body);
  if (!parsed.success) {
    // Say what was wrong with it: scripts/add-recipe.mjs prints this straight
    // through, so whoever wrote the recipe can see which field to fix.
    const op = (body as { op?: unknown })?.op;
    return NextResponse.json(
      {
        error: op === "recipe.add" ? "That recipe isn't valid." : "Unrecognised change.",
        detail: z.prettifyError(parsed.error),
      },
      { status: 400 }
    );
  }
  const mutation = parsed.data;

  // A night pointing at a recipe that doesn't exist would plan a dinner nobody
  // can open, and would drop silently out of the kits and the buy list.
  if (mutation.op === "plan.write") {
    const wanted = [...new Set(Object.values(mutation.set).map((e) => e.recipeId))];
    const known = wanted.length
      ? new Set(
          db.select({ id: customRecipes.id }).from(customRecipes).where(inArray(customRecipes.id, wanted)).all().map((r) => r.id)
        )
      : new Set<string>();
    const unknown = wanted.filter((id) => !known.has(id));
    if (unknown.length) {
      return NextResponse.json(
        { error: `No recipe with id ${unknown.map((id) => `"${id}"`).join(", ")}.` },
        { status: 400 }
      );
    }
  }

  // The key is what everything matches on, so it's worked out here rather
  // than taken from the client. ", tinned" has a name but no key.
  if (mutation.op === "pantry.add" && !pantryKey(mutation.item)) {
    return NextResponse.json({ error: `"${mutation.item}" isn't a name to match on.` }, { status: 400 });
  }

  // Every mutation is one transaction, so a cascade can never half-apply.
  getSqlite().transaction(() => {
    switch (mutation.op) {
      case "plan.write": {
        for (const [dateKey, entry] of Object.entries(mutation.set)) {
          db.insert(planEntries)
            .values({ dateKey, ...entry })
            .onConflictDoUpdate({
              target: planEntries.dateKey,
              set: { recipeId: entry.recipeId, servings: entry.servings, cookFor: entry.cookFor },
            })
            .run();
        }
        if (mutation.remove.length) {
          db.delete(planEntries).where(inArray(planEntries.dateKey, mutation.remove)).run();
        }
        break;
      }

      case "goals.write": {
        db.insert(settings)
          .values({ id: 1, goals: mutation.goals })
          .onConflictDoUpdate({ target: settings.id, set: { goals: mutation.goals } })
          .run();
        break;
      }

      case "checks.write": {
        for (const check of mutation.set) {
          db.insert(checks).values(check).onConflictDoNothing().run();
        }
        if (mutation.remove.length) {
          db.delete(checks).where(inArray(checks.key, mutation.remove)).run();
        }
        break;
      }

      case "checks.clear": {
        // Check keys start with a dateKey, so a week's worth is a prefix match.
        // DateKey is validated as digits and dashes, so it can't smuggle in a
        // LIKE wildcard.
        const scope = mutation.days?.length
          ? or(...mutation.days.map((day) => like(checks.key, `${day}|%`)))
          : undefined;
        db.delete(checks).where(and(eq(checks.kind, mutation.kind), scope)).run();
        break;
      }

      case "recipe.add": {
        db.insert(customRecipes)
          .values({ id: mutation.recipe.id, data: mutation.recipe })
          .onConflictDoUpdate({ target: customRecipes.id, set: { data: mutation.recipe } })
          .run();
        break;
      }

      case "recipe.delete": {
        db.delete(customRecipes).where(eq(customRecipes.id, mutation.id)).run();
        // A deleted recipe must not be left pointed at from any week, not just
        // the one on screen.
        db.delete(planEntries).where(eq(planEntries.recipeId, mutation.id)).run();
        break;
      }

      case "pantry.add": {
        const key = pantryKey(mutation.item);
        // Left out, the date stays as it was; null clears it.
        const useBy = mutation.useBy === undefined ? {} : { useBy: mutation.useBy };
        db.insert(pantryItems)
          .values({ key, item: mutation.item, useBy: mutation.useBy ?? null })
          .onConflictDoUpdate({ target: pantryItems.key, set: { item: mutation.item, ...useBy } })
          .run();
        break;
      }

      case "pantry.remove": {
        db.delete(pantryItems).where(inArray(pantryItems.key, mutation.keys)).run();
        break;
      }
    }
  })();

  return NextResponse.json({ ok: true });
}
