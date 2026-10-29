import type { z } from "zod";
import type { Aisle } from "./constants";
import type {
  AddOnSchema,
  CalloutSchema,
  IngredientSchema,
  MacrosSchema,
  RecipeSchema,
  StepSchema,
} from "./schema";

// Recipe shapes come from the zod schemas in schema.ts, so there is one definition.
export type Ingredient = z.infer<typeof IngredientSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Callout = z.infer<typeof CalloutSchema>;
export type AddOn = z.infer<typeof AddOnSchema>;
export type Macros = z.infer<typeof MacrosSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type ReheatQuality = Recipe["reheat"]["quality"];

/** A recipe on its way in, before the app has given it an id. */
export type DraftRecipe = Omit<Recipe, "id">;

export interface PlanEntry {
  recipeId: string;
  servings: number;
  /** 1 = cook for tonight, 2 = cook double and cover tomorrow as well. */
  cookFor: 1 | 2;
}

/**
 * dateKey (YYYY-MM-DD) -> what is being cooked that night. Most keys are
 * absent, so the value is optional: the app leans on that everywhere it asks
 * whether a night is empty.
 */
export type Plan = Record<string, PlanEntry | undefined>;

export type Goals = Macros;

export interface Kit {
  key: string;
  date: Date;
  dayName: string;
  nextDayName: string;
  recipe: Recipe;
  servings: number;
  nights: number;
  portions: number;
  contents: Ingredient[];
  cupboard: Ingredient[];
}

export interface BuyItem {
  key: string;
  item: string;
  unit: string | null;
  aisle: Aisle;
  staple: boolean;
  qty: number;
  from: string[];
  /** On the kitchen list by exactly this name, so it may not need buying. */
  onHand: boolean;
}

/** Something already in the kitchen, to be used up before it goes off. */
export interface PantryItem {
  /** pantryKey(item): the name it is matched by, and its identity. */
  key: string;
  item: string;
  /** YYYY-MM-DD, or null for things that keep. */
  useBy: string | null;
}

export type CheckKind = "ticked" | "packed";

/** The whole of a kitchen, as the client holds it. */
export interface KitchenState {
  plan: Plan;
  goals: Goals;
  ticked: Record<string, boolean>;
  packed: Record<string, boolean>;
  recipes: Recipe[];
  /** What's already in the kitchen, soonest use-by first. */
  pantry: PantryItem[];
}
