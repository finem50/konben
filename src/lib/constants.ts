import type { Goals } from "./types";

export const AISLES = ["Produce", "Protein", "Dairy", "Bakery", "Pantry", "Frozen"] as const;

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const LONG_DAYS: Record<DayName, string> = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

export type Aisle = (typeof AISLES)[number];
export type DayName = (typeof DAY_NAMES)[number];

/** A kitchen that has never set its own targets gets these, a plate at a time. */
export const DEFAULT_GOALS: Goals = { kcal: 700, protein: 45, carbs: 65, fat: 25 };
