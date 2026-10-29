import { z } from "zod";
import { AISLES } from "./constants";

/**
 * What a recipe has to look like to get into the app.
 *
 * Recipes arrive from two places — the Add a recipe form, and Claude Code via
 * scripts/add-recipe.mjs — and neither is trusted to get the shape right, so
 * this is enforced at the API boundary rather than in either caller.
 */
export const IngredientSchema = z.object({
  item: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1).nullable(),
  aisle: z.enum(AISLES),
  /** A short knife instruction ("Peel and dice"), or null where none applies. */
  prep: z.string().nullable().optional(),
  /** Cupboard things the cook already owns, kept out of the kit bag. */
  staple: z.boolean().optional(),
  /** Printed on the card as "Contains: Milk". */
  allergens: z.array(z.string().min(1)).optional(),
});

/**
 * A method step. A bare string is the original one-liner; the card form gives
 * the step a title, a few actions, and an optional tip, like a meal-box card.
 */
export const StepSchema = z.union([
  z.string().min(1),
  z.object({
    title: z.string().min(1),
    actions: z.array(z.string().min(1)).min(1),
    tip: z.string().min(1).optional(),
  }),
]);

/** A short "why this matters" callout, e.g. what the garlic herb butter is. */
export const CalloutSchema = z.object({ title: z.string().min(1), text: z.string().min(1) });

/** An optional protein or veg swapped in, with its own instructions. */
export const AddOnSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1).nullable(),
  kcal: z.number().nonnegative(),
  allergens: z.array(z.string().min(1)).optional(),
  actions: z.array(z.string().min(1)).min(1),
});

export const MacrosSchema = z.object({
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});

export const RecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Total time, prep included. */
  minutes: z.number().int().positive(),
  /** Hands-on prep, when the card separates it out. */
  prepMinutes: z.number().int().positive().optional(),
  /** "swirled with Garlic Herb Butter" — the line under the name. */
  subtitle: z.string().min(1).optional(),
  servings: z.number().int().positive(),
  macros: MacrosSchema,
  reheat: z.object({
    quality: z.enum(["great", "ok", "poor"]),
    how: z.string().min(1),
  }),
  ingredients: z.array(IngredientSchema).min(1),
  steps: z.array(StepSchema).min(1),
  /** Pots, pans and tools to get out before starting. */
  equipment: z.array(z.string().min(1)).optional(),
  callouts: z.array(CalloutSchema).optional(),
  addOns: z.array(AddOnSchema).optional(),
});
