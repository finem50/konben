import { describe, expect, it } from "vitest";
import { addDays, keyOf } from "../dates";
import {
  assign,
  buildBuyList,
  buildKits,
  clearWeek,
  leftoverSource,
  mergeName,
  pantryKey,
  pantryMatches,
  pantryNameMatches,
  randomizeWeek,
  setCookFor,
  swapNights,
} from "../planning";
import type { PantryItem, Plan, Recipe } from "../types";

const monday = new Date("2026-09-07T00:00:00");
const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
const [MON, TUE, WED, THU, FRI] = week.map(keyOf);

const chilli: Recipe = {
  id: "r1",
  name: "Black bean chili",
  minutes: 45,
  servings: 4,
  macros: { kcal: 390, protein: 18, carbs: 58, fat: 9 },
  reheat: { quality: "great", how: "Better on day two." },
  ingredients: [
    { item: "Red onion", qty: 2, unit: null, aisle: "Produce" },
    { item: "Ground cumin", qty: 2, unit: "tsp", aisle: "Pantry", staple: true },
  ],
  steps: ["Soften the onion.", "Simmer."],
};

const soup: Recipe = {
  ...chilli,
  id: "r2",
  name: "Red lentil soup",
  servings: 4,
  ingredients: [
    { item: "Red onion", qty: 1, unit: null, aisle: "Produce" },
    { item: "Red lentils", qty: 300, unit: "g", aisle: "Pantry" },
  ],
};

const byId = { r1: chilli, r2: soup };

describe("cooking for two nights", () => {
  it("sizes one kit for both nights rather than producing two", () => {
    let plan: Plan = assign({}, MON, chilli).next;
    plan = setCookFor(plan, MON, 2).next;

    const kits = buildKits(week, plan, byId);
    expect(kits).toHaveLength(1);
    expect(kits[0].nights).toBe(2);
    // Default plate count is 2, so two nights' worth is 4 portions —
    // exactly the recipe's own serving size, so the scale is 1x.
    expect(kits[0].portions).toBe(4);
    expect(kits[0].contents[0].qty).toBe(2);
  });

  it("turns the following night into a leftovers night", () => {
    let plan: Plan = assign({}, MON, chilli).next;
    plan = setCookFor(plan, MON, 2).next;

    expect(leftoverSource(plan, TUE)).toEqual({ key: MON, entry: plan[MON] });
    expect(leftoverSource(plan, WED)).toBeNull();
  });

  it("releases the next night when something is planned into it", () => {
    let plan: Plan = assign({}, MON, chilli).next;
    plan = setCookFor(plan, MON, 2).next;

    const result = assign(plan, TUE, soup);
    expect(result.next[MON]!.cookFor).toBe(1);
    // The released night is written back, not just the newly planned one.
    expect(Object.keys(result.set).sort()).toEqual([MON, TUE].sort());
  });

  it("clears the night it had taken over", () => {
    let plan: Plan = assign({}, MON, chilli).next;
    plan = assign(plan, TUE, soup).next;

    const result = setCookFor(plan, MON, 2);
    expect(result.next[TUE]).toBeUndefined();
    expect(result.remove).toEqual([TUE]);
  });
});

describe("swapping nights", () => {
  const single = (recipeId: string) => ({ recipeId, servings: 2, cookFor: 1 as const });
  const double = (recipeId: string) => ({ recipeId, servings: 2, cookFor: 2 as const });

  it("moves a dinner to an empty night, writing only those two nights", () => {
    const result = swapNights({ [MON]: single("r1") }, MON, THU);
    expect(result.next).toEqual({ [THU]: single("r1") });
    expect(result.set).toEqual({ [THU]: single("r1") });
    expect(result.remove).toEqual([MON]);
    expect(result.downgraded).toEqual([]);
  });

  it("swaps two planned nights", () => {
    const result = swapNights({ [MON]: single("r1"), [WED]: single("r2") }, MON, WED);
    expect(result.next).toEqual({ [MON]: single("r2"), [WED]: single("r1") });
    expect(Object.keys(result.set).sort()).toEqual([MON, WED]);
    expect(result.remove).toEqual([]);
  });

  it("keeps a double covering the night after where it lands", () => {
    const result = swapNights({ [MON]: double("r1") }, MON, WED);
    expect(result.next).toEqual({ [WED]: double("r1") });
    expect(leftoverSource(result.next, THU)?.key).toBe(WED);
    expect(result.downgraded).toEqual([]);
  });

  it("cooks a double for one night when the night after it lands is taken", () => {
    const result = swapNights({ [MON]: double("r1"), [THU]: single("r2") }, MON, WED);
    expect(result.next[WED]).toEqual(single("r1"));
    expect(result.next[THU]).toEqual(single("r2"));
    expect(result.downgraded).toEqual([{ key: WED, recipeId: "r1" }]);
  });

  it("releases the double that covered a leftovers night dropped onto", () => {
    const result = swapNights({ [MON]: double("r1"), [THU]: single("r2") }, THU, TUE);
    expect(result.next).toEqual({ [MON]: single("r1"), [TUE]: single("r2") });
    expect(result.downgraded).toEqual([{ key: MON, recipeId: "r1" }]);
    expect(Object.keys(result.set).sort()).toEqual([MON, TUE]);
    expect(result.remove).toEqual([THU]);
  });

  it("lets a double move onto its own leftovers night", () => {
    const result = swapNights({ [MON]: double("r1") }, MON, TUE);
    expect(result.next).toEqual({ [TUE]: double("r1") });
    expect(leftoverSource(result.next, WED)?.key).toBe(TUE);
  });

  it("swaps a double with a single and keeps what still fits", () => {
    const plan = { [MON]: double("r1"), [WED]: single("r2") };
    const result = swapNights(plan, MON, WED);
    expect(result.next).toEqual({ [MON]: single("r2"), [WED]: double("r1") });
    expect(swapNights({ ...plan, [THU]: single("r1"), [FRI]: single("r2") }, MON, WED).next[WED]).toEqual(single("r1"));
  });

  it("does nothing when a dinner is dropped on its own night", () => {
    const result = swapNights({ [MON]: double("r1") }, MON, MON);
    expect(result.set).toEqual({});
    expect(result.remove).toEqual([]);
  });
});

describe("the buy list", () => {
  it("merges an ingredient shared by two dinners into one line", () => {
    let plan: Plan = assign({}, MON, chilli).next;
    plan = assign(plan, TUE, soup).next;

    const items = buildBuyList(buildKits(week, plan, byId), MON);
    const onions = items.filter((i) => i.item === "Red onion");

    expect(onions).toHaveLength(1);
    expect(onions[0].qty).toBe(1.5);
    expect(onions[0].from).toEqual(["Black bean chili", "Red lentil soup"]);
  });

  it("keeps cupboard staples out of the kit but still on the list", () => {
    const plan: Plan = assign({}, MON, chilli).next;
    const kits = buildKits(week, plan, byId);

    expect(kits[0].contents.map((i) => i.item)).toEqual(["Red onion"]);
    expect(kits[0].cupboard.map((i) => i.item)).toEqual(["Ground cumin"]);
    expect(buildBuyList(kits, MON).find((i) => i.item === "Ground cumin")?.staple).toBe(true);
  });

  it("only counts a merged item as a staple when every dinner does", () => {
    const withStock = (recipe: Recipe, staple: boolean): Recipe => ({
      ...recipe,
      ingredients: [
        ...recipe.ingredients,
        { item: "Vegetable stock", qty: 500, unit: "ml", aisle: "Pantry", staple },
      ],
    });
    const mixed = { r1: withStock(chilli, true), r2: withStock(soup, false) };

    let plan: Plan = assign({}, MON, chilli).next;
    plan = assign(plan, TUE, soup).next;

    const stock = buildBuyList(buildKits(week, plan, mixed), MON).filter(
      (i) => i.item === "Vegetable stock"
    );
    expect(stock).toHaveLength(1);
    expect(stock[0].staple).toBe(false);
    expect(stock[0].qty).toBe(500);
  });

  it("merges the singular and plural of the same item", () => {
    const lemons = (recipe: Recipe, item: string): Recipe => ({
      ...recipe,
      ingredients: [{ item, qty: 2, unit: null, aisle: "Produce" }],
    });
    const byName = { r1: lemons(chilli, "Lemon"), r2: lemons(soup, "Lemons") };

    let plan: Plan = assign({}, MON, chilli).next;
    plan = assign(plan, TUE, soup).next;

    const items = buildBuyList(buildKits(week, plan, byName), MON);
    expect(items).toHaveLength(1);
    expect(items[0].item).toBe("Lemon");
    expect(items[0].qty).toBe(2);
  });

  it("singularises only the name's last word, and leaves real -s words alone", () => {
    expect(mergeName("Roma tomatoes")).toBe(mergeName("Roma tomato"));
    expect(mergeName("Poblano Peppers")).toBe(mergeName("poblano pepper"));
    expect(mergeName("Black beans, tinned")).toBe("black bean, tinned");
    expect(mergeName("Radishes")).toBe(mergeName("Radish"));
    expect(mergeName("Berries")).toBe(mergeName("Berry"));
    expect(mergeName("Hummus")).toBe("hummus");
    expect(mergeName("Couscous")).toBe("couscous");
    expect(mergeName("Asparagus")).toBe("asparagus");
    expect(mergeName("Peas")).toBe("pea");
    expect(mergeName("Eggs")).toBe("egg");
  });

  it("keys each item to its week, so a tick doesn't carry over", () => {
    const plan: Plan = assign(assign({}, MON, chilli).next, keyOf(addDays(monday, 7)), chilli).next;
    const nextWeek = Array.from({ length: 7 }, (_, i) => addDays(monday, i + 7));
    const nextMon = keyOf(nextWeek[0]);

    const thisOnion = buildBuyList(buildKits(week, plan, byId), MON).find((i) => i.item === "Red onion");
    const nextOnion = buildBuyList(buildKits(nextWeek, plan, byId), nextMon).find((i) => i.item === "Red onion");

    expect(thisOnion?.key).not.toBe(nextOnion?.key);
  });
});

describe("clearing a week", () => {
  it("removes only the nights on screen", () => {
    let plan: Plan = assign({}, MON, chilli).next;
    plan = assign(plan, keyOf(addDays(monday, 9)), soup).next;

    const result = clearWeek(plan, week);
    expect(result.next[MON]).toBeUndefined();
    expect(result.next[keyOf(addDays(monday, 9))]).toBeDefined();
  });
});

describe("randomizing a week", () => {
  const recipes = [chilli, soup, { ...soup, id: "r3", name: "Dal" }];
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it("fills only the ticked nights, with no repeats, and clears the rest", () => {
    const plan: Plan = assign({}, WED, chilli).next;
    const result = randomizeWeek(plan, week, [MON, TUE, keyOf(week[4])], recipes);

    expect(Object.keys(result.set).sort()).toEqual([MON, TUE, keyOf(week[4])].sort());
    expect(new Set(Object.values(result.set).map((e) => e.recipeId)).size).toBe(3);
    expect(result.next[WED]).toBeUndefined();
    expect(result.remove).toHaveLength(4);
  });

  it("still fills every night when there are more nights than recipes", () => {
    const result = randomizeWeek({}, week, week.map(keyOf), [chilli, soup]);
    expect(week.every((d) => result.next[keyOf(d)])).toBe(true);
  });

  it("stops last Sunday's double cook covering a ticked Monday", () => {
    const sunday = keyOf(addDays(monday, -1));
    const plan: Plan = { [sunday]: { recipeId: "r1", servings: 2, cookFor: 2 } };
    const result = randomizeWeek(plan, week, [MON], recipes);
    expect(result.next[sunday]!.cookFor).toBe(1);
  });

  it("is repeatable given the same random source", () => {
    const a = randomizeWeek({}, week, [MON, TUE], recipes, seeded(7));
    const b = randomizeWeek({}, week, [MON, TUE], recipes, seeded(7));
    expect(a.set).toEqual(b.set);
  });
});

const onHand = (item: string, useBy: string | null = null): PantryItem => ({ key: pantryKey(item), item, useBy });

/** A recipe whose only non-staple ingredients are `items`. */
const using = (id: string, ...items: string[]): Recipe => ({
  ...chilli,
  id,
  name: id,
  ingredients: [
    ...items.map((item) => ({ item, qty: 1, unit: null, aisle: "Produce" as const })),
    { item: "Olive oil", qty: 1, unit: "tbsp", aisle: "Pantry" as const, staple: true },
  ],
});

describe("matching what's in the kitchen", () => {
  it("keys on the name before the comma, singular", () => {
    expect(pantryKey("Lemons")).toBe("lemon");
    expect(pantryKey("Roma tomatoes")).toBe(pantryKey("roma tomato"));
    expect(pantryKey("Black beans, tinned")).toBe(pantryKey("black beans"));
    expect(pantryKey(", tinned")).toBe("");
  });

  // Names as real saved recipes tend to spell them.
  it("lets the cook's plain name stand in for a recipe's longer one", () => {
    const match = (pantry: string, ingredient: string) => pantryNameMatches(pantryKey(pantry), pantryKey(ingredient));
    for (const ingredient of ["Onion", "Yellow onion", "Red onion"]) expect(match("onion", ingredient)).toBe(true);
    expect(match("parsley", "Fresh parsley")).toBe(true);
    expect(match("mushrooms", "Cremini mushrooms")).toBe(true);
    expect(match("bell pepper", "Green bell pepper")).toBe(true);
    expect(match("chicken", "Chicken stock")).toBe(false);
    expect(match("red onion", "Onion")).toBe(false);
    expect(match("", "Onion")).toBe(false);
  });

  it("ignores staples, and anything past its use-by that night", () => {
    const recipe = using("x", "Red onion");
    expect(pantryMatches(recipe, [onHand("olive oil")], MON)).toEqual([]);
    expect(pantryMatches(recipe, [onHand("onion", MON)], TUE)).toEqual([]);
    expect(pantryMatches(recipe, [onHand("onion", MON)], MON)).toHaveLength(1);
  });

  it("weights what goes off soonest highest", () => {
    const recipe = using("x", "Red onion");
    const weight = (useBy: string | null) => pantryMatches(recipe, [onHand("onion", useBy)], MON)[0].weight;
    expect(weight(keyOf(addDays(monday, 2)))).toBe(3);
    expect(weight(keyOf(addDays(monday, 6)))).toBe(2);
    expect(weight(keyOf(addDays(monday, 7)))).toBe(1);
    expect(weight(null)).toBe(1);
  });

  it("marks a buy-list line on hand by its exact name only", () => {
    const byIdHere = { a: using("a", "Red onions"), b: using("b", "Sour cream") };
    let plan: Plan = assign({}, MON, byIdHere.a).next;
    plan = assign(plan, TUE, byIdHere.b).next;
    const items = buildBuyList(buildKits(week, plan, byIdHere), MON, [onHand("red onion"), onHand("cream")]);

    expect(items.find((i) => i.item === "Red onions")?.onHand).toBe(true);
    // "cream" ranks a sour cream dinner higher, but never says you have sour cream.
    expect(items.find((i) => i.item === "Sour cream")?.onHand).toBe(false);
    expect(items.find((i) => i.item === "Olive oil")?.onHand).toBe(false);
  });
});

describe("rolling a week around what's in the kitchen", () => {
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const weeknights = week.slice(0, 5).map(keyOf);
  const filler = ["f1", "f2", "f3", "f4", "f5", "f6"].map((id) => using(id, `Filler ${id}`));

  it("puts a dinner that uses what's turning on the week", () => {
    const recipes = [...filler, using("spinach", "Baby spinach")];
    for (let seed = 1; seed < 20; seed++) {
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed), [onHand("baby spinach", THU)]);
      expect(Object.values(result.set).map((e) => e.recipeId)).toContain("spinach");
    }
  });

  it("uses up what goes off Tuesday early in the week", () => {
    const recipes = [...filler, using("spinach", "Baby spinach")];
    const result = randomizeWeek({}, week, weeknights, recipes, seeded(3), [onHand("baby spinach", TUE)]);
    expect(result.set[MON]!.recipeId).toBe("spinach");
  });

  it("covers a second item before using the first one twice", () => {
    const recipes = [...filler, using("b", "Zucchini"), using("b2", "Zucchini"), using("c", "Feta")];
    const pantry = [onHand("zucchini", TUE), onHand("feta", FRI)];
    for (let seed = 1; seed < 20; seed++) {
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed), pantry);
      // The zucchini goes first, being dated; Tuesday then goes to the feta,
      // not to a second zucchini dinner.
      expect(["b", "b2"]).toContain(result.set[MON]!.recipeId);
      expect(result.set[TUE]!.recipeId).toBe("c");
    }
  });

  it("never deals a dinner picked for what's on hand a second time", () => {
    // Monday picks one feta dinner for the feta; Tuesday is dealt from the deck,
    // which must no longer hold it.
    const recipes = [using("a", "Feta"), using("b", "Feta")];
    for (let seed = 1; seed < 20; seed++) {
      const result = randomizeWeek({}, week, [MON, TUE], recipes, seeded(seed), [onHand("feta", FRI)]);
      expect(new Set(Object.values(result.set).map((e) => e.recipeId)).size).toBe(2);
    }
  });

  it("fills the other nights at random, with no repeats", () => {
    const recipes = [...filler, using("spinach", "Baby spinach")];
    const result = randomizeWeek({}, week, weeknights, recipes, seeded(9), [onHand("baby spinach", THU)]);
    expect(Object.keys(result.set).sort()).toEqual(weeknights);
    expect(new Set(Object.values(result.set).map((e) => e.recipeId)).size).toBe(5);
  });

  it("only leans toward what keeps, so its dinner isn't on every roll", () => {
    // Twelve fillers and five nights: a plain deal has any one dinner on ~40% of weeks.
    const fillers = Array.from({ length: 12 }, (_, i) => using(`f${i}`, `Filler ${i}`));
    const recipes = [...fillers, using("cheese", "Monterey Jack cheese")];
    const later = keyOf(addDays(monday, 21));
    for (const pantry of [[onHand("monterey jack cheese")], [onHand("monterey jack cheese", later)]]) {
      const count = (id: string) => {
        let n = 0;
        for (let seed = 1; seed <= 200; seed++) {
          // Spread out: small seeds all start with a near-zero draw.
          const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed * 104729), pantry);
          if (Object.values(result.set).some((e) => e.recipeId === id)) n++;
        }
        return n;
      };
      const cheese = count("cheese");
      expect(cheese).toBeLessThan(200);
      expect(cheese).toBeGreaterThan(count("f0"));
    }
  });

  it("uses what's turning before what keeps", () => {
    const recipes = [...filler, using("tofu", "Firm tofu"), using("cheese", "Monterey Jack cheese")];
    for (let seed = 1; seed < 20; seed++) {
      const pantry = [onHand("monterey jack cheese"), onHand("firm tofu", WED)];
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed), pantry);
      expect(result.set[MON]!.recipeId).toBe("tofu");
    }
  });

  it("uses what goes off tonight before what lasts two more days", () => {
    // Both used to count as "goes off within two days", so a coin toss could put
    // the zucchini on Monday and leave the spinach to go off.
    const recipes = [...filler, using("zucchini", "Zucchini"), using("spinach", "Baby spinach")];
    const pantry = [onHand("baby spinach", MON), onHand("zucchini", WED)];
    for (let seed = 1; seed < 40; seed++) {
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed * 104729), pantry);
      expect(result.set[MON]!.recipeId).toBe("spinach");
      expect(result.set[TUE]!.recipeId).toBe("zucchini");
    }
  });

  it("prefers the dinner that uses more of what's turning when the soonest ties", () => {
    const recipes = [...filler, using("one", "Zucchini"), using("both", "Zucchini", "Feta")];
    const pantry = [onHand("zucchini", WED), onHand("feta", FRI)];
    for (let seed = 1; seed < 20; seed++) {
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed), pantry);
      expect(result.set[MON]!.recipeId).toBe("both");
    }
  });

  it("deals every recipe before repeating one when something is on hand", () => {
    const recipes = [using("a", "Feta"), using("b", "Filler b"), using("c", "Filler c")];
    const keys = week.map(keyOf);
    for (let seed = 1; seed < 20; seed++) {
      const result = randomizeWeek({}, week, keys, recipes, seeded(seed), [onHand("feta")]);
      const ids = keys.map((k) => result.set[k]!.recipeId);
      expect(new Set(ids.slice(0, 3)).size).toBe(3);
      expect(new Set(ids.slice(3, 6)).size).toBe(3);
    }
  });

  it("is the same random week as before when nothing is on hand", () => {
    // The deal as it was before the kitchen list: one shuffled deck, popped.
    const reference = (recipes: Recipe[], keys: string[], random: () => number) => {
      const out: Record<string, string> = {};
      let deck: Recipe[] = [];
      for (const key of keys) {
        if (!deck.length) {
          deck = [...recipes];
          for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
          }
        }
        out[key] = deck.pop()!.id;
      }
      return out;
    };
    const keys = week.map(keyOf);
    for (let seed = 1; seed < 10; seed++) {
      const result = randomizeWeek({}, week, keys, filler.slice(0, 4), seeded(seed));
      const ids = Object.fromEntries(Object.entries(result.set).map(([k, e]) => [k, e.recipeId]));
      expect(ids).toEqual(reference(filler.slice(0, 4), keys, seeded(seed)));
    }
  });
});

describe("rolling around the kitchen items the cook ticks", () => {
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const weeknights = week.slice(0, 5).map(keyOf);
  const fillers = Array.from({ length: 12 }, (_, i) => using(`f${i}`, `Filler ${i}`));

  it("puts a ticked item that keeps on every roll, first", () => {
    const recipes = [...fillers, using("cheese", "Monterey Jack cheese")];
    const pantry = [onHand("monterey jack cheese")];
    for (let seed = 1; seed < 40; seed++) {
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed * 104729), pantry, [pantry[0].key]);
      expect(result.set[MON]!.recipeId).toBe("cheese");
    }
  });

  it("gives every ticked item a dinner, one using several going first", () => {
    const recipes = [...fillers, using("rice", "Jasmine rice"), using("tofu", "Firm tofu"), using("both", "Jasmine rice", "Firm tofu"), using("kale", "Kale")];
    const pantry = [onHand("jasmine rice"), onHand("firm tofu"), onHand("kale")];
    const priority = pantry.map((p) => p.key);
    for (let seed = 1; seed < 40; seed++) {
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed), pantry, priority);
      expect(result.set[MON]!.recipeId).toBe("both");
      expect(result.set[TUE]!.recipeId).toBe("kale");
      // Rice and tofu are covered, so their single dinners get no more help.
      const ids = Object.values(result.set).map((e) => e.recipeId);
      expect(new Set(ids).size).toBe(5);
    }
  });

  it("puts ticked items ahead of what's turning, then still uses what's turning", () => {
    const recipes = [...fillers, using("cheese", "Monterey Jack cheese"), using("tofu", "Firm tofu")];
    const pantry = [onHand("firm tofu", WED), onHand("monterey jack cheese")];
    for (let seed = 1; seed < 20; seed++) {
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed), pantry, ["monterey jack cheese"]);
      expect(result.set[MON]!.recipeId).toBe("cheese");
      expect(result.set[TUE]!.recipeId).toBe("tofu");
    }
  });

  it("among ticked dinners, picks the one that also uses what's turning", () => {
    const recipes = [...fillers, using("plain", "Feta"), using("greens", "Feta", "Baby spinach")];
    const pantry = [onHand("baby spinach", TUE), onHand("feta")];
    for (let seed = 1; seed < 20; seed++) {
      const result = randomizeWeek({}, week, weeknights, recipes, seeded(seed), pantry, ["feta"]);
      expect(result.set[MON]!.recipeId).toBe("greens");
    }
  });

  it("doesn't cook a ticked item after its use-by", () => {
    const recipes = [using("a", "Filler a"), using("spinach", "Baby spinach")];
    const pantry = [onHand("baby spinach", MON)];
    for (let seed = 1; seed < 20; seed++) {
      const result = randomizeWeek({}, week, [TUE, WED], recipes, seeded(seed), pantry, ["baby spinach"]);
      // Past its use-by, the spinach no longer counts, so Tuesday is a plain draw.
      expect(Object.keys(result.set).sort()).toEqual([TUE, WED]);
    }
    const tuesday = (seed: number) => randomizeWeek({}, week, [TUE], recipes, seeded(seed), pantry, ["baby spinach"]).set[TUE]!.recipeId;
    expect(new Set(Array.from({ length: 30 }, (_, i) => tuesday(i * 104729 + 1))).size).toBe(2);
  });

  it("rolls exactly as unticked when nothing ticked is used by any dinner", () => {
    const recipes = [...fillers, using("cheese", "Monterey Jack cheese")];
    const pantry = [onHand("monterey jack cheese"), onHand("saffron")];
    for (let seed = 1; seed < 20; seed++) {
      const a = randomizeWeek({}, week, weeknights, recipes, seeded(seed), pantry);
      const b = randomizeWeek({}, week, weeknights, recipes, seeded(seed), pantry, ["saffron", "not on hand"]);
      expect(b.set).toEqual(a.set);
    }
  });

  it("still cooks every rolled night for one and frees last Sunday's double", () => {
    const sunday = keyOf(addDays(monday, -1));
    const plan: Plan = { [sunday]: { recipeId: "f0", servings: 2, cookFor: 2 } };
    const recipes = [...fillers, using("cheese", "Monterey Jack cheese")];
    const result = randomizeWeek(plan, week, weeknights, recipes, seeded(5), [onHand("monterey jack cheese")], ["monterey jack cheese"]);
    expect(result.next[sunday]!.cookFor).toBe(1);
    expect(weeknights.every((k) => result.set[k]!.cookFor === 1)).toBe(true);
  });
});
