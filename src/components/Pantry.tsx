"use client";

import { useMemo, useState } from "react";
import { LONG_DAYS } from "@/lib/constants";
import { dayNameOf, keyOf } from "@/lib/dates";
import { labelUseBy } from "@/lib/format";
import { pantryKey, pantryMatches } from "@/lib/planning";
import type { PantryItem, Plan, Recipe } from "@/lib/types";

interface PantryProps {
  pantry: PantryItem[];
  recipes: Recipe[];
  days: Date[];
  plan: Plan;
  recipeById: Record<string, Recipe>;
  todayKey: string;
  onAdd: (item: string, useBy?: string) => void;
  onRemove: (key: string) => void;
}

/**
 * What's already in the kitchen. The picker and the Recipes filter put dinners
 * that use these up first, soonest use-by first; Roll always uses what goes off
 * within the week and only leans toward the rest. This tab shows which of this
 * week's dinners use each item, and what nothing is using yet.
 */
export default function Pantry({ pantry, recipes, days, plan, recipeById, todayKey, onAdd, onRemove }: PantryProps) {
  const [item, setItem] = useState("");
  const [useBy, setUseBy] = useState("");

  // Every name a dinner shops for, once each, so what's typed matches a recipe.
  const suggestions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const recipe of recipes) {
      for (const ing of recipe.ingredients) {
        if (ing.staple) continue;
        const key = pantryKey(ing.item);
        if (key && !byKey.has(key)) byKey.set(key, ing.item.split(",")[0].trim());
      }
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [recipes]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!pantryKey(item)) return;
    onAdd(item, useBy || undefined);
    setItem("");
    setUseBy("");
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>In the kitchen</h2>
      <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: "62ch", marginBottom: 14 }}>
        Add what needs using up. Picking a dinner and the Recipes filter put dinners
        that use it first, soonest use-by first. Rolling the week always uses what
        goes off within six days, and makes dinners using the rest more likely.
      </p>

      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <input
          className="konben-input"
          style={{ maxWidth: 260 }}
          placeholder="e.g. red onion"
          list="konben-pantry-names"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          aria-label="Ingredient"
        />
        <datalist id="konben-pantry-names">
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          Use by
          <input
            type="date"
            className="konben-input"
            style={{ width: "auto" }}
            min={todayKey}
            value={useBy}
            onChange={(e) => setUseBy(e.target.value)}
          />
        </label>
        <button className="konben-btn" disabled={!pantryKey(item)}>
          Add
        </button>
      </form>

      {pantry.length === 0 ? (
        <div className="konben-card konben-empty">
          Nothing listed. Add what&apos;s in the fridge, and dinners that use it go first.
        </div>
      ) : (
        <div className="konben-card" style={{ padding: "4px 14px" }}>
          {pantry.map((p) => {
            const inDinners = recipes.filter((r) => pantryMatches(r, [{ ...p, useBy: null }], todayKey).length).length;
            const thisWeek = days.flatMap((d) => {
              const k = keyOf(d);
              const r = plan[k] && recipeById[plan[k]!.recipeId];
              return r && pantryMatches(r, [p], k).length ? [`${LONG_DAYS[dayNameOf(k)]}: ${r.name}`] : [];
            });
            const urgent = !!p.useBy && p.useBy <= todayKey;

            return (
              <div className="konben-item" key={p.key}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span className="konben-item-name">{p.item}</span>
                    {p.useBy && (
                      <span style={{ fontSize: 13, whiteSpace: "nowrap", color: urgent ? "var(--brick)" : "var(--muted)", fontWeight: urgent ? 600 : 400 }}>
                        {labelUseBy(p.useBy, todayKey)}
                      </span>
                    )}
                  </div>
                  <div className="konben-item-sub">
                    {inDinners === 0
                      ? "No dinner uses this. Try the name a recipe uses."
                      : `Used in ${inDinners} dinner${inDinners === 1 ? "" : "s"}. `}
                    {inDinners > 0 &&
                      (thisWeek.length ? (
                        thisWeek.join(", ")
                      ) : (
                        <span style={{ color: "var(--brick)" }}>Not in this week&apos;s plan.</span>
                      ))}
                  </div>
                </div>
                <button
                  className="konben-btn-ghost"
                  style={{ fontSize: 12, padding: "4px 9px" }}
                  onClick={() => onRemove(p.key)}
                  aria-label={`${p.item} is used up`}
                >
                  Used up
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
