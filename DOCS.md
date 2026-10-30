# Konben field guide

*How the app is put together.* For running it, adding recipes, developing and
configuration, see the [README](README.md).

**On this page:** [A tour of the app](#a-tour-of-the-app) · [How it fits together](#how-it-fits-together) · [Data model](#data-model)

## A tour of the app

Six tabs, each reading off the same week: `Week`, `Kits`, `Buy list`, `Kitchen`, `Recipes`, `Macros`.

- **Week board** — seven nights, a recipe assigned or empty. Assigning a recipe defaults its servings and sets `cookFor: 1`; ticking "cook for two" claims the following night as leftovers and pulls it out of the board.
- **Kits** — one card per cooking night, portioned to however many nights it covers. Each kit splits its ingredients into what goes in the bag (`contents`) and what's assumed already in the cupboard (`cupboard`), and can be marked packed.
- **Buy list** — every kit's ingredients merged into one list, grouped by aisle, quantities summed where the same item shows up in more than one recipe. Items merge on name and unit, ignoring case and singular/plural ("Lemon" and "Lemons" are one line); a different unit or a synonym ("Cilantro", "Coriander") stays a separate line. Ticking an item off is a per-item write, not a whole-list refresh, and ticks belong to their week.
- **Kitchen** — what's on hand: a name and an optional use-by for each item. The recipe picker, Roll and the Recipes filter favour dinners that use them.
- **Recipes** — the library: the thirteen recipes the app starts with, plus anything added by hand or through Claude Code. Each recipe carries minutes, servings, macros, a reheat rating, ingredients, and steps, in the meal-box card format (subtitle, prep time, equipment, titled steps, callouts), whether it came from the Add a recipe form or from Claude Code.
- **Macros** — a chart of the week against household goals (kcal, protein, carbs, fat — editable), with leftovers nights correctly attributed to the recipe that's actually being eaten.

**Reheat quality** is the rating that governs whether a recipe is a sane candidate for the double-cook rule:

- 🟢 **great** — barely changes reheated
- 🟡 **ok** — fine with a fix (loosen a sauce, add a splash of stock)
- 🔴 **poor** — cook it fresh each time; not a leftovers candidate

**Ingredients** sort into six aisles, and any item marked a staple is assumed already in the cupboard — kept out of the kit bag, and hidden on the buy list behind a "Show cupboard staples" toggle. When dinners share an item, it only counts as a staple if every one of them marks it so; one recipe that needs it bought puts it back on the list:

`Produce` · `Protein` · `Dairy` · `Bakery` · `Pantry` · `Frozen` · **staple → cupboard**

## How it fits together

One rule set, applied everywhere. `lib/planning.ts` turns a plan into kits and a buy list; every edit to the week goes through the same reducers, whether it comes from a click in the UI or a script.

```mermaid
flowchart LR
  library["recipe library<br/><small>recipe rows</small>"] --> planning
  plan["week plan<br/><small>dateKey → entry</small>"] --> planning
  planning["<b>planning.ts</b><br/><small>buildKits / buildBuyList</small>"] --> kits["kits<br/><small>one per night</small>"]
  planning --> buy["buy list<br/><small>merged, by aisle</small>"]
  kits --> ui["Konben.tsx<br/><small>the six tabs</small>"]
  buy --> ui
  ui --> api["<b>api/state</b><br/><small>POST mutation</small>"]
  api --> db["SQLite<br/><small>konben-data volume</small>"]
```

A click in the UI calls a reducer in `planning.ts` → posts just the changed rows to `/api/state` → applied in one SQLite transaction, so two devices editing different nights never clobber each other. The README lists what each module does.

## Data model

Five tables, each about as small as the thing it's tracking. A plan entry is identified by its date; a mutation is one of eight operations, validated and applied as a single transaction so a cascade — like deleting a recipe out from under a planned night — never half-applies.

| Table | Key | Holds |
| --- | --- | --- |
| `plan_entries` | `date_key` | Which recipe, how many servings, cook for 1 or 2 nights — one row per planned night. |
| `custom_recipes` | `id` | Every recipe, built-in or added by hand or via `add-recipe.mjs`, stored as a JSON document. |
| `settings` | `id = 1` | The single row holding the household's macro targets. |
| `checks` | `key` | Ticked shopping items and packed kits, told apart by `kind`. |
| `pantry_items` | `key` | What's on hand in the kitchen: a name and an optional use-by. |

**Mutations**, all POSTed to `/api/state`:

| op | Effect |
| --- | --- |
| `plan.write` | Upserts the given date → entry rows, deletes the given date keys — never a whole-week rewrite. Refused if an entry names a recipe that doesn't exist. |
| `goals.write` | Replaces the macro targets. |
| `checks.write` | Adds/removes ticked or packed rows. |
| `checks.clear` | Clears one kind of check (ticked or packed) for the given `days` — the week on screen — or for every week if no days are given. |
| `recipe.add` | Upserts a custom recipe, validated against `RecipeSchema`. |
| `recipe.delete` | Deletes a recipe and clears any night still pointing at it. |
| `pantry.add` | Adds or updates an on-hand item, keyed by its plain name, with an optional use-by. |
| `pantry.remove` | Removes on-hand items by key. |
