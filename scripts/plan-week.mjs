#!/usr/bin/env node
/**
 * Plan a week of dinners in a running Konben.
 *
 *   node scripts/plan-week.mjs --list
 *   node scripts/plan-week.mjs --list --max-minutes 30 --reheat great
 *   node scripts/plan-week.mjs --pick 4 --max-minutes 30 --exclude r5,r8
 *   node scripts/plan-week.mjs week.json --clear
 *   node scripts/plan-week.mjs week.json --week next --dry-run
 *
 * The candidate list is every recipe the app holds, built-in or added.
 */

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(`--${name}`);
}
function value(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1] ?? fallback;
}
function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const baseUrl = value("url") ?? process.env.KONBEN_URL ?? "http://localhost:3000";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const QUALITY_ORDER = { great: 0, ok: 1, poor: 2 };
const DEFAULT_PLATES = 2;
/** Flags followed by a value, so that value is never mistaken for the plan file. */
const VALUE_FLAGS = new Set(["--url", "--week", "--max-minutes", "--reheat", "--exclude", "--pick"]);

/* ---------------------------------------------------------------- dates --- */

const keyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseKey = (k) => new Date(`${k}T00:00:00`);
const addDays = (d, n) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};
const nextKey = (k) => keyOf(addDays(parseKey(k), 1));
const prevKey = (k) => keyOf(addDays(parseKey(k), -1));

function sundayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Which Sunday the plan hangs off: this week, next week, or a given date. */
function targetSunday() {
  const week = value("week", "this");
  if (week === "this") return sundayOf(new Date());
  if (week === "next") return addDays(sundayOf(new Date()), 7);
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return sundayOf(parseKey(week));
  fail(`--week wants "this", "next", or a YYYY-MM-DD date, not "${week}".`);
}

/* ------------------------------------------------------------- recipes --- */

async function loadRecipes() {
  let state;
  try {
    const response = await fetch(`${baseUrl}/api/state`);
    if (!response.ok) throw new Error(String(response.status));
    state = await response.json();
  } catch {
    fail(`Couldn't reach Konben at ${baseUrl}. Is it running?`);
  }

  return { plan: state.plan ?? {}, recipes: state.recipes ?? [] };
}

/** Everything the cook could be given tonight, after the command-line filters. */
function candidates(recipes) {
  const maxMinutes = value("max-minutes") ? Number(value("max-minutes")) : null;
  const qualities = value("reheat") ? value("reheat").split(",").map((q) => q.trim()) : null;
  const excluded = new Set((value("exclude") ?? "").split(",").filter(Boolean));

  return recipes.filter((recipe) => {
    if (excluded.has(recipe.id)) return false;
    if (maxMinutes !== null && recipe.minutes > maxMinutes) return false;
    if (qualities && !qualities.includes(recipe.reheat.quality)) return false;
    return true;
  });
}

function describe(recipe) {
  const kit = recipe.ingredients.filter((i) => !i.staple).map((i) => i.item);
  return `${recipe.id}  ${recipe.minutes}min  ${recipe.reheat.quality.padEnd(5)}  ${recipe.name}\n      ${kit.join(", ")}`;
}

/* ------------------------------------------------------------ the plan --- */

/** Turn "Mon" or "2026-09-07" into a date key inside the target week. */
function resolveDay(label, sunday) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;
  const index = DAY_NAMES.indexOf(label.slice(0, 3).replace(/^./, (c) => c.toUpperCase()));
  if (index === -1) fail(`"${label}" isn't a day. Use Sun–Sat or a YYYY-MM-DD key.`);
  return keyOf(addDays(sunday, index));
}

async function applyPlan(file) {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(file, "utf8").catch(() => fail(`Can't read ${file}`));

  let wanted;
  try {
    wanted = JSON.parse(raw);
  } catch (error) {
    fail(`That isn't valid JSON — ${error.message}`);
  }

  const { plan, recipes } = await loadRecipes();
  const byId = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const sunday = targetSunday();
  const weekKeys = Array.from({ length: 7 }, (_, i) => keyOf(addDays(sunday, i)));

  const set = {};
  for (const [label, spec] of Object.entries(wanted)) {
    const dateKey = resolveDay(label, sunday);
    const id = typeof spec === "string" ? spec : spec.recipe ?? spec.recipeId;
    const recipe = byId[id];
    if (!recipe) fail(`No recipe with id "${id}" (for ${label}). Run --list to see what's there.`);

    const cookFor = (typeof spec === "object" && spec.cookFor) || 1;
    if (cookFor !== 1 && cookFor !== 2) fail(`cookFor for ${label} must be 1 or 2.`);

    // The point of the app: a two-night cook means no cooking tomorrow, so the
    // dish has to survive the night. Planning a "poor" one leaves them with
    // nothing to eat.
    if (cookFor === 2 && recipe.reheat.quality === "poor" && !flag("force")) {
      fail(
        `${recipe.name} is rated "poor" for reheating — cooking it double leaves ${label} + 1 with nothing edible.\n` +
          `  Plan it for one night, or pass --force if you really mean it.`
      );
    }

    set[dateKey] = {
      recipeId: recipe.id,
      // Plates a night, not the recipe's own serving size: the app defaults to 2
      // too (src/lib/planning.ts), and the kit is scaled from this.
      servings: (typeof spec === "object" && spec.servings) || DEFAULT_PLATES,
      cookFor,
    };
  }

  // A two-night cook takes over the night after it: that night must be empty.
  const remove = new Set();
  for (const [dateKey, entry] of Object.entries(set)) {
    if (entry.cookFor !== 2) continue;
    const after = nextKey(dateKey);
    if (set[after]) {
      fail(
        `${dateKey} is cooked double, which covers ${after} — but ${after} has its own dinner too.\n` +
          `  Drop one of them.`
      );
    }
    remove.add(after);
  }
  if (flag("clear")) for (const key of weekKeys) if (!set[key]) remove.add(key);

  // Same rule as planning.assign: a night that gets its own dinner is no longer
  // covered by the night before, so that one goes back to cooking once.
  const released = [];
  for (const dateKey of Object.keys(set)) {
    const before = prevKey(dateKey);
    if (set[before] || remove.has(before) || plan[before]?.cookFor !== 2) continue;
    set[before] = { ...plan[before], cookFor: 1 };
    released.push(before);
  }
  for (const key of released) {
    console.error(`! ${key} was cooking double to cover ${nextKey(key)}; it now cooks for one night.`);
  }

  const body = { op: "plan.write", set, remove: [...remove] };
  if (flag("dry-run")) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/api/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    fail(`Couldn't reach Konben at ${baseUrl}. Is it running?`);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    fail(`Konben rejected the plan — ${detail?.error ?? response.status}${detail?.detail ? `\n  ${detail.detail}` : ""}`);
  }

  for (const [index, dateKey] of weekKeys.entries()) {
    const entry = set[dateKey];
    const covered = set[weekKeys[index - 1]]?.cookFor === 2;
    const label = `${DAY_NAMES[index]} ${dateKey}`;
    if (entry) {
      const recipe = byId[entry.recipeId];
      console.log(`  ${label}  ${recipe.name}${entry.cookFor === 2 ? "  (cook double)" : ""}`);
    } else if (covered) {
      console.log(`  ${label}  — leftovers, no cooking`);
    } else {
      console.log(`  ${label}  —`);
    }
  }
  console.log("\nPlanned. Refresh Konben to see the week.");
}

/* ----------------------------------------------------------------- run --- */

const file = args.find((arg, i) => !arg.startsWith("--") && !VALUE_FLAGS.has(args[i - 1]));

if (flag("list") || flag("pick")) {
  const { recipes } = await loadRecipes();
  let pool = candidates(recipes);
  pool.sort((a, b) => QUALITY_ORDER[a.reheat.quality] - QUALITY_ORDER[b.reheat.quality] || a.minutes - b.minutes);

  if (flag("pick")) {
    const n = Number(value("pick", "4"));
    if (!Number.isInteger(n) || n < 1) fail("--pick wants a whole number of dinners.");
    if (pool.length < n) fail(`Only ${pool.length} recipe(s) match those filters, and you asked for ${n}.`);
    // Fisher-Yates, so every draw is as likely as any other.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool = pool.slice(0, n);
  }

  if (flag("json")) {
    console.log(JSON.stringify(pool.map(({ id, name, minutes, servings, reheat }) => ({ id, name, minutes, servings, reheat: reheat.quality })), null, 2));
  } else {
    for (const recipe of pool) console.log(describe(recipe));
    console.log(`\n${pool.length} dinner${pool.length === 1 ? "" : "s"}.`);
  }
} else if (file) {
  await applyPlan(file);
} else {
  fail("Give me a plan file, or --list / --pick to see what's available.");
}
