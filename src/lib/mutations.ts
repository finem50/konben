import { z } from "zod";
import { MacrosSchema, RecipeSchema } from "./schema";

const PlanEntrySchema = z.object({
  recipeId: z.string(),
  servings: z.number().int().min(1).max(99),
  cookFor: z.union([z.literal(1), z.literal(2)]),
});

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Every write the client can make, scoped to the rows it actually touches.
 *
 * The planning rules (a two-night cook releasing the next night, and so on)
 * live in the client reducers in lib/planning.ts and are applied there; what
 * arrives here is the resulting rows. That keeps one implementation of the
 * rules while still writing only what changed, so two devices editing
 * different nights never clobber each other.
 */
export const Mutation = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("plan.write"),
    set: z.record(DateKey, PlanEntrySchema).default({}),
    remove: z.array(DateKey).default([]),
  }),
  z.object({ op: z.literal("goals.write"), goals: MacrosSchema }),
  z.object({
    op: z.literal("checks.write"),
    set: z.array(z.object({ key: z.string(), kind: z.enum(["ticked", "packed"]) })).default([]),
    remove: z.array(z.string()).default([]),
  }),
  z.object({
    op: z.literal("checks.clear"),
    kind: z.enum(["ticked", "packed"]),
    /** Only clear checks keyed to these nights; omit to clear every week. */
    days: z.array(DateKey).min(1).optional(),
  }),
  z.object({ op: z.literal("recipe.add"), recipe: RecipeSchema }),
  z.object({ op: z.literal("recipe.delete"), id: z.string() }),
  /** Upserts by pantryKey(item); leaving out useBy keeps the date it had. */
  z.object({
    op: z.literal("pantry.add"),
    item: z.string().trim().min(1).max(80),
    useBy: DateKey.nullable().optional(),
  }),
  z.object({ op: z.literal("pantry.remove"), keys: z.array(z.string()).min(1) }),
]);

export type Mutation = z.infer<typeof Mutation>;

/** The same writes as the client builds them, before zod fills in defaults. */
export type MutationInput = z.input<typeof Mutation>;
