import { LONG_DAYS } from "./constants";
import { dayNameOf, parseKey } from "./dates";
import type { PantryMatch } from "./planning";
import type { ReheatQuality } from "./types";

const trimNum = (n: number): string => String(Math.round(n * 100) / 100);

export function fmtQty(qty: number, unit: string | null): string {
  if (!unit) return `×${trimNum(Math.ceil(qty * 2) / 2)}`;
  if (unit === "g" || unit === "ml") {
    return `${qty >= 20 ? Math.round(qty / 5) * 5 : Math.round(qty)} ${unit}`;
  }
  return `${trimNum(Math.round(qty * 4) / 4)} ${unit}`;
}

export const shortDate = (d: Date): string =>
  d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

export const KEEPS: Record<ReheatQuality, string> = {
  great: "Keeps well",
  ok: "Keeps, eat it cold",
  poor: "Cook to order",
};

/** "use by tomorrow", "use by Thursday", "use by 21 Oct", or that it's past it. */
export function labelUseBy(useBy: string, todayKey: string): string {
  const days = Math.round((parseKey(useBy).getTime() - parseKey(todayKey).getTime()) / 86_400_000);
  if (days < 0) return "past its use-by";
  if (days === 0) return "use by today";
  if (days === 1) return "use by tomorrow";
  if (days <= 6) return `use by ${LONG_DAYS[dayNameOf(useBy)]}`;
  return `use by ${shortDate(parseKey(useBy))}`;
}

/** "Uses your red onion (use by tomorrow), feta" under a recipe that would use them up. */
export function usesLine(matches: PantryMatch[], todayKey: string): string {
  const names = matches.map(({ item }) =>
    item.useBy ? `${item.item.toLowerCase()} (${labelUseBy(item.useBy, todayKey)})` : item.item.toLowerCase()
  );
  return `Uses your ${names.join(", ")}`;
}
