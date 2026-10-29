import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One row per planned night. The date key (YYYY-MM-DD) is the identity. */
export const planEntries = sqliteTable("plan_entries", {
  dateKey: text("date_key").primaryKey(),
  recipeId: text("recipe_id").notNull(),
  servings: integer("servings").notNull(),
  cookFor: integer("cook_for").notNull().default(1),
});

/**
 * Every recipe, built-in or added by hand or through scripts/add-recipe.mjs. The
 * built-ins (r1…) were put here by migration 0004 with created_at 0. Stored as a JSON document
 * because nothing queries into them — the app always wants the whole recipe.
 */
export const customRecipes = sqliteTable("custom_recipes", {
  id: text("id").primaryKey(),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Single row (id = 1) holding the macro targets. */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  goals: text("goals", { mode: "json" }).notNull(),
});

/** Ticked-off shopping items and packed kits. `kind` separates the two. */
export const checks = sqliteTable("checks", {
  key: text("key").primaryKey(),
  kind: text("kind", { enum: ["ticked", "packed"] }).notNull(),
});

/**
 * What's already in the kitchen. `key` is pantryKey(item), so "Zucchinis" and
 * "zucchini" are one row. No quantities: the list is for steering the plan
 * toward what needs using up, not for stock-keeping.
 */
export const pantryItems = sqliteTable("pantry_items", {
  key: text("key").primaryKey(),
  item: text("item").notNull(),
  useBy: text("use_by"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});
