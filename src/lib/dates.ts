import { DAY_NAMES, type DayName } from "./constants";

export const keyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export const parseKey = (k: string): Date => new Date(`${k}T00:00:00`);

/** The Sunday a date's week starts on. */
export function sundayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export const nextKey = (k: string): string => keyOf(addDays(parseKey(k), 1));
export const prevKey = (k: string): string => keyOf(addDays(parseKey(k), -1));
export const dayNameOf = (k: string): DayName => DAY_NAMES[parseKey(k).getDay()];
