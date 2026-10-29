import { dayNameOf, keyOf, nextKey, parseKey, prevKey } from "./dates";
import type { BuyItem, Kit, PantryItem, Plan, PlanEntry, Recipe } from "./types";

export interface LeftoverSource {
  key: string;
  entry: PlanEntry;
}

/**
 * A night is a leftovers night when nothing is planned for it and the night
 * before was cooked double.
 */
export function leftoverSource(plan: Plan, dateKey: string): LeftoverSource | null {
  if (plan[dateKey]) return null;
  const previous = prevKey(dateKey);
  const src = plan[previous];
  return src && src.cookFor === 2 ? { key: previous, entry: src } : null;
}

/**
 * One kit per cooking night. A two-night cook gets a single kit sized for both
 * nights, which is what stops the second night appearing on the shopping list.
 */
export function buildKits(
  days: Date[],
  plan: Plan,
  recipeById: Record<string, Recipe>
): Kit[] {
  return days.flatMap((date) => {
    const key = keyOf(date);
    const entry = plan[key];
    const recipe = entry && recipeById[entry.recipeId];
    if (!entry || !recipe) return [];

    const nights = entry.cookFor || 1;
    const portions = entry.servings * nights;
    const scale = portions / recipe.servings;

    return [
      {
        key,
        date,
        dayName: dayNameOf(key),
        nextDayName: dayNameOf(nextKey(key)),
        recipe,
        servings: entry.servings,
        nights,
        portions,
        contents: recipe.ingredients
          .filter((i) => !i.staple)
          .map((i) => ({ ...i, qty: i.qty * scale })),
        cupboard: recipe.ingredients
          .filter((i) => i.staple)
          .map((i) => ({ ...i, qty: i.qty * scale })),
      },
    ];
  });
}

/**
 * Merge every kit's ingredients into one list, summing anything that repeats.
 * Item keys carry the week (its Sunday's dateKey), so ticking onions this week
 * leaves next week's onions unticked.
 */
export function buildBuyList(kits: Kit[], weekKey: string, pantry: PantryItem[] = []): BuyItem[] {
  const map = new Map<string, BuyItem>();
  // Exact names only: a looser match could hide something that does need buying.
  const onHand = new Set(pantry.map((p) => p.key));

  for (const kit of kits) {
    for (const ing of [...kit.contents, ...kit.cupboard]) {
      const key = `${mergeName(ing.item)}|${ing.unit || ""}`;
      const prev = map.get(key);
      if (prev) {
        prev.qty += ing.qty;
        // A staple only if every dinner using it counts it as one, so an item
        // one recipe needs bought is never hidden among the cupboard staples.
        prev.staple = prev.staple && !!ing.staple;
        if (!prev.from.includes(kit.recipe.name)) prev.from.push(kit.recipe.name);
      } else {
        map.set(key, {
          key: `${weekKey}|${key}`,
          item: ing.item,
          unit: ing.unit,
          aisle: ing.aisle,
          staple: !!ing.staple,
          qty: ing.qty,
          from: [kit.recipe.name],
          onHand: onHand.has(pantryKey(ing.item)),
        });
      }
    }
  }

  return Array.from(map.values());
}

/**
 * The name two ingredients have to share to go on one line: case and spacing
 * ignored, and the last word of the name singular, so "Lemon" and "Lemons" or
 * "Roma tomato" and "Roma tomatoes" merge. Only the part before a comma counts
 * as the name ("Black beans, tinned"). Words that end in s without being
 * plural (hummus, asparagus, glass) are left alone.
 */
export function mergeName(item: string): string {
  const [head, ...rest] = item.toLowerCase().split(",");
  const words = head.trim().split(/\s+/);
  words[words.length - 1] = singular(words[words.length - 1]);
  return [words.join(" "), ...rest.map((part) => part.trim())].join(", ");
}

/**
 * The name something on the kitchen list goes by: mergeName without anything
 * after the comma, so "Black beans" is on hand for "Black beans, tinned".
 */
export function pantryKey(item: string): string {
  return mergeName(item).split(",")[0].trim();
}

/**
 * Whether an on-hand item can stand in for a recipe ingredient (both as
 * pantryKeys). Recipes say "Yellow onion" and "Fresh parsley" where the cook
 * says "onion" and "parsley", so the on-hand name only has to be the last
 * word(s) of the ingredient's. "chicken" still isn't "chicken stock".
 */
export function pantryNameMatches(onHand: string, ingredient: string): boolean {
  return !!onHand && (ingredient === onHand || ingredient.endsWith(` ${onHand}`));
}

export interface PantryMatch {
  item: PantryItem;
  /** 3 if it goes off within two days of the night, 2 within six, else 1. */
  weight: number;
}

/**
 * The on-hand items a recipe would use up if cooked on `dateKey`. Staples are
 * left out (everyone has them, so they'd make every recipe look like a match),
 * as is anything past its use-by by that night.
 */
export function pantryMatches(recipe: Recipe, pantry: PantryItem[], dateKey: string): PantryMatch[] {
  if (!pantry.length) return [];
  const names = recipe.ingredients.filter((i) => !i.staple).map((i) => pantryKey(i.item));
  return pantry.flatMap((item) => {
    if (!names.some((name) => pantryNameMatches(item.key, name))) return [];
    const weight = urgency(item.useBy, dateKey);
    return weight > 0 ? [{ item, weight }] : [];
  });
}

/** Soonest use-by first; things that keep go last, in the order they were added. */
export function bySoonest(a: PantryItem, b: PantryItem): number {
  if (a.useBy === b.useBy) return 0;
  if (!a.useBy) return 1;
  if (!b.useBy) return -1;
  return a.useBy < b.useBy ? -1 : 1;
}

/** Whole days from `dateKey` to `useBy`: 0 on the use-by itself, negative after it, null if it keeps. */
function daysLeft(useBy: string | null, dateKey: string): number | null {
  if (!useBy) return null;
  return Math.round((parseKey(useBy).getTime() - parseKey(dateKey).getTime()) / 86_400_000);
}

function urgency(useBy: string | null, dateKey: string): number {
  const days = daysLeft(useBy, dateKey);
  if (days === null) return 1;
  if (days < 0) return 0;
  if (days <= 2) return 3;
  if (days <= 6) return 2;
  return 1;
}

function singular(word: string): string {
  if (word.length < 4) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(oes|ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/* ------------------------------------------------------------------ */
/* plan reducers                                                       */
/* ------------------------------------------------------------------ */

/**
 * The planning rules live here, in one place. Each reducer returns both the
 * next plan (for the optimistic local update) and the exact rows that changed,
 * which is what gets written to the server — so a write only ever touches the
 * nights it actually affected.
 */
export interface PlanChange {
  next: Plan;
  set: Record<string, PlanEntry>;
  remove: string[];
}

function change(plan: Plan, set: Record<string, PlanEntry>, remove: string[]): PlanChange {
  const next = { ...plan, ...set };
  for (const key of remove) delete next[key];
  return { next, set, remove };
}

export function assign(
  plan: Plan,
  dateKey: string,
  recipe: Recipe,
  servings?: number
): PlanChange {
  const set: Record<string, PlanEntry> = {
    [dateKey]: { recipeId: recipe.id, servings: servings ?? 2, cookFor: 1 },
  };

  // If the night before was covering this one, it no longer is.
  const previous = prevKey(dateKey);
  const before = plan[previous];
  if (before && before.cookFor === 2) set[previous] = { ...before, cookFor: 1 };

  return change(plan, set, []);
}

export function clearDay(plan: Plan, dateKey: string): PlanChange {
  return change(plan, {}, [dateKey]);
}

export function setServings(plan: Plan, dateKey: string, servings: number): PlanChange {
  const entry = plan[dateKey];
  if (!entry) return change(plan, {}, []);
  return change(plan, { [dateKey]: { ...entry, servings: Math.max(1, servings) } }, []);
}

export function setCookFor(plan: Plan, dateKey: string, nights: 1 | 2): PlanChange {
  const entry = plan[dateKey];
  if (!entry) return change(plan, {}, []);
  // Cooking for two nights takes over the next night.
  const remove = nights === 2 ? [nextKey(dateKey)] : [];
  return change(plan, { [dateKey]: { ...entry, cookFor: nights } }, remove);
}

export interface SwapChange extends PlanChange {
  /** Nights that were cooked double and no longer can be, because the night after is now taken. */
  downgraded: { key: string; recipeId: string }[];
}

/**
 * Swap two nights' dinners (either may be empty, so this also moves a dinner
 * to a free night). A double cook keeps covering the night after wherever it
 * lands, unless that night has a dinner, in which case it cooks for one. The
 * same goes for a double the night before either night, as in `assign`.
 */
export function swapNights(plan: Plan, fromKey: string, toKey: string): SwapChange {
  if (fromKey === toKey) return { ...change(plan, {}, []), downgraded: [] };

  const next: Plan = { ...plan, [fromKey]: plan[toKey], [toKey]: plan[fromKey] };
  const downgraded: SwapChange["downgraded"] = [];
  const single = (key: string) => {
    const entry = next[key];
    if (entry && entry.cookFor === 2 && next[nextKey(key)]) {
      next[key] = { ...entry, cookFor: 1 };
      downgraded.push({ key, recipeId: entry.recipeId });
    }
  };
  for (const key of [fromKey, toKey]) {
    single(key);
    if (next[key]) single(prevKey(key));
  }

  const set: Record<string, PlanEntry> = {};
  const remove: string[] = [];
  for (const key of new Set([fromKey, toKey, prevKey(fromKey), prevKey(toKey)])) {
    const entry = next[key];
    if (!entry) {
      if (plan[key]) remove.push(key);
    } else if (entry !== plan[key]) {
      set[key] = entry;
    }
  }
  return { ...change(plan, set, remove), downgraded };
}

export function clearWeek(plan: Plan, days: Date[]): PlanChange {
  return change(plan, {}, days.map(keyOf));
}

/** How much more likely each on-hand item that keeps makes a dinner in a roll. */
const KEEPS_BOOST = 1;

/**
 * Replace the week with a dinner on each of `nightKeys`. Nights go in date
 * order, and each one is filled by the first of these that applies:
 *
 * 1. Kitchen items the cook ticked to prioritize (`priority`, as pantry keys)
 *    that no night this week uses yet: the night goes to the recipe using the
 *    most of them, so every ticked item gets a dinner, earliest in the week.
 * 2. Anything in the kitchen going off within six days of the night is
 *    turning: the night goes to the recipe that uses whatever is closest to
 *    its use-by and not yet spoken for, then the one using the most turning
 *    food, so nothing is cooked after it has gone off.
 * 3. Otherwise a random draw in which each item that keeps (later or no
 *    use-by) makes a dinner using it more likely, but never certain, so the
 *    same few don't come up every roll.
 *
 * Ties at steps 1 and 2 go to whatever is turning soonest, then at random. No
 * recipe repeats while there are unused ones left; with more nights than
 * recipes they all go back in. With nothing on hand it is a plain
 * Fisher–Yates deal. Every night is cooked for one: the cook chooses doubles.
 */
export function randomizeWeek(
  plan: Plan,
  days: Date[],
  nightKeys: string[],
  recipes: Recipe[],
  random: () => number = Math.random,
  pantry: PantryItem[] = [],
  priority: string[] = []
): PlanChange {
  const set: Record<string, PlanEntry> = {};
  let deck: Recipe[] = [];
  /** Recipes dealt since they last all went back in. */
  const dealt = new Set<string>();
  /** On-hand items a night this week already uses. */
  const covered = new Set<string>();
  const ticked = new Set(priority);

  for (const key of [...nightKeys].sort()) {
    if (!recipes.length) break;
    let pick: Recipe;
    if (pantry.length) {
      if (recipes.every((r) => dealt.has(r.id))) dealt.clear();
      pick =
        firmPick(recipes, dealt, covered, pantry, ticked, key, random) ??
        drawWeighted(recipes, dealt, covered, pantry, key, random);
    } else {
      if (!deck.length) {
        let fresh = recipes.filter((r) => !dealt.has(r.id));
        if (!fresh.length) {
          dealt.clear();
          fresh = recipes;
        }
        deck = shuffle(fresh, random);
      }
      pick = deck.pop()!;
    }
    dealt.add(pick.id);
    for (const match of pantryMatches(pick, pantry, key)) covered.add(match.item.key);
    set[key] = { recipeId: pick.id, servings: 2, cookFor: 1 };
  }

  // A double cook the night before the week can't cover a night we've filled.
  const first = days.length ? keyOf(days[0]) : null;
  if (first && set[first]) {
    const previous = prevKey(first);
    const before = plan[previous];
    if (before && before.cookFor === 2) set[previous] = { ...before, cookFor: 1 };
  }

  const remove = days.map(keyOf).filter((key) => !set[key]);
  return change(plan, set, remove);
}

/** A recipe's on-hand matches that night that no other night this week uses yet. */
function uncovered(recipe: Recipe, covered: Set<string>, pantry: PantryItem[], dateKey: string): PantryMatch[] {
  return pantryMatches(recipe, pantry, dateKey).filter((m) => !covered.has(m.item.key));
}

/**
 * How firmly a recipe claims a night, compared left to right: uncovered
 * ticked items it uses, then minus the days left on the soonest uncovered
 * item it uses that's turning, then how many turning items it uses. Null when
 * it uses neither a ticked nor a turning item, so the night stays a draw.
 */
function claim(matches: PantryMatch[], ticked: Set<string>, dateKey: string): number[] | null {
  const priority = matches.filter((m) => ticked.has(m.item.key)).length;
  const turning = matches.filter((m) => m.weight >= 2);
  if (!priority && !turning.length) return null;
  const soonest = Math.min(...turning.map((m) => daysLeft(m.item.useBy, dateKey)!));
  return [priority, turning.length ? -soonest : -Infinity, turning.length];
}

function compareClaims(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** The undealt recipe with the firmest claim on the night (see `claim`), if any has one. */
function firmPick(
  recipes: Recipe[],
  dealt: Set<string>,
  covered: Set<string>,
  pantry: PantryItem[],
  ticked: Set<string>,
  dateKey: string,
  random: () => number
): Recipe | undefined {
  let best: number[] | null = null;
  let top: Recipe[] = [];
  for (const recipe of recipes) {
    if (dealt.has(recipe.id)) continue;
    const score = claim(uncovered(recipe, covered, pantry, dateKey), ticked, dateKey);
    if (!score) continue;
    const order = best ? compareClaims(score, best) : 1;
    if (order > 0) {
      best = score;
      top = [recipe];
    } else if (order === 0) {
      top.push(recipe);
    }
  }
  return top.length > 1 ? top[Math.floor(random() * top.length)] : top[0];
}

/** An undealt recipe at random, each uncovered on-hand item it uses making it more likely. */
function drawWeighted(
  recipes: Recipe[],
  dealt: Set<string>,
  covered: Set<string>,
  pantry: PantryItem[],
  dateKey: string,
  random: () => number
): Recipe {
  const pool = recipes.filter((r) => !dealt.has(r.id));
  const weights = pool.map((r) => 1 + KEEPS_BOOST * uncovered(r, covered, pantry, dateKey).length);
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
