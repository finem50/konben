"use client";

import { useState } from "react";
import { KEEPS, usesLine } from "@/lib/format";
import { pantryMatches, type PantryMatch } from "@/lib/planning";
import type { PantryItem, Recipe } from "@/lib/types";

/**
 * Recipes in the order that best uses up what's in the kitchen on `dateKey`,
 * each with what it would use. Ties keep their library order. An item some
 * other dinner this week already uses counts for half, so the list leans
 * toward what isn't spoken for yet.
 */
function rankByPantry(
  recipes: Recipe[],
  pantry: PantryItem[],
  dateKey: string,
  covered: Set<string> = new Set()
): { recipe: Recipe; matches: PantryMatch[]; score: number }[] {
  return recipes
    .map((recipe) => {
      const matches = pantryMatches(recipe, pantry, dateKey);
      const score = matches.reduce((n, m) => n + (covered.has(m.item.key) ? m.weight / 2 : m.weight), 0);
      return { recipe, matches, score };
    })
    .sort((a, b) => b.score - a.score);
}

const usesStyle = { fontSize: 12, color: "var(--green)", marginTop: 3, fontWeight: 500 } as const;

interface RecipeLibraryProps {
  recipes: Recipe[];
  pantry: PantryItem[];
  todayKey: string;
  onOpen: (id: string) => void;
  onAddNew: () => void;
}

export function RecipeLibrary({ recipes, pantry, todayKey, onOpen, onAddNew }: RecipeLibraryProps) {
  const [q, setQ] = useState("");
  const [keepsOnly, setKeepsOnly] = useState(false);
  const [onHandOnly, setOnHandOnly] = useState(false);
  const ranked = rankByPantry(recipes, pantry, todayKey);
  const shown = (onHandOnly ? ranked.filter((r) => r.score > 0) : recipes.map((recipe) => ({ recipe, matches: [] as PantryMatch[] })))
    .filter(({ recipe: r }) => {
      if (keepsOnly && r.reheat.quality === "poor") return false;
      return q.trim()
        ? (r.name + " " + r.ingredients.map((i) => i.item).join(" ")).toLowerCase().includes(q.trim().toLowerCase())
        : true;
    });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="konben-input"
          style={{ maxWidth: 300 }}
          placeholder="Search dinners or ingredients"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="konben-btn-ghost"
          onClick={() => setKeepsOnly((s) => !s)}
          style={keepsOnly ? { borderColor: "var(--ink)", background: "var(--mustard-soft)" } : undefined}
        >
          Only ones that cover two nights
        </button>
        <button
          className="konben-btn-ghost"
          onClick={() => setOnHandOnly((s) => !s)}
          disabled={!pantry.length}
          title={pantry.length ? undefined : "Add what you have on the Kitchen tab first"}
          style={onHandOnly ? { borderColor: "var(--ink)", background: "var(--mustard-soft)" } : undefined}
        >
          Uses what I have
        </button>
        <button className="konben-btn" style={{ marginLeft: "auto" }} onClick={onAddNew}>
          Add a recipe
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="konben-card konben-empty">
          {onHandOnly ? "No dinner uses what's on your Kitchen list." : "Nothing matches. Try an ingredient, or add a recipe."}
        </div>
      ) : (
        <div className="konben-grid">
          {shown.map(({ recipe: r, matches }) => (
            <button key={r.id} className="konben-card" onClick={() => onOpen(r.id)} style={{ textAlign: "left", padding: 13, background: "var(--paper)" }}>
              <h3 style={{ fontSize: 16, marginBottom: 8, lineHeight: 1.25 }}>{r.name}</h3>
              <div style={{ marginBottom: 8 }}>
                <span className="konben-pill">{r.minutes} min</span>
                <span className="konben-pill">serves {r.servings}</span>
                <span
                  className="konben-pill"
                  style={r.reheat.quality === "great" ? { borderColor: "var(--green)", color: "var(--green)", background: "var(--green-soft)" } : undefined}
                >
                  {KEEPS[r.reheat.quality]}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {r.macros.kcal} kcal and {r.macros.protein}g protein a plate
              </div>
              {matches.length > 0 && <div style={usesStyle}>{usesLine(matches, todayKey)}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface RecipePickerProps {
  recipes: Recipe[];
  pantry: PantryItem[];
  /** The night being picked for, which decides what's still in date. */
  dateKey: string;
  /** Kitchen items another dinner this week already uses. */
  covered: Set<string>;
  todayKey: string;
  nextDayName: string;
  /** Something is already planned the next night, which cooking double replaces. */
  nextTaken: boolean;
  onPick: (recipe: Recipe, twoNights: boolean) => void;
  onClose: () => void;
}

export function RecipePicker({ recipes, pantry, dateKey, covered, todayKey, nextDayName, nextTaken, onPick, onClose }: RecipePickerProps) {
  const [q, setQ] = useState("");
  const shown = rankByPantry(recipes, pantry, dateKey, covered).filter(({ recipe: r }) =>
    q.trim() ? (r.name + " " + r.ingredients.map((i) => i.item).join(" ")).toLowerCase().includes(q.trim().toLowerCase()) : true
  );

  return (
    <div className="konben-scrim" onClick={onClose}>
      <div className="konben-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontSize: 19 }}>Pick a dinner</h2>
          <button className="konben-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <input className="konben-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div style={{ marginTop: 12 }}>
          {shown.map(({ recipe: r, matches }) => (
            <div key={r.id} style={{ borderBottom: "1px solid var(--rule)", padding: "11px 2px" }}>
              <button onClick={() => onPick(r, false)} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", padding: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {r.minutes} min, serves {r.servings}, {r.macros.kcal} kcal a plate
                </div>
                {matches.length > 0 && <div style={usesStyle}>{usesLine(matches, todayKey)}</div>}
              </button>
              {r.reheat.quality !== "poor" && (
                <button
                  className="konben-btn-ghost"
                  style={{ marginTop: 7, fontSize: 12, padding: "5px 9px", ...(nextTaken ? { color: "var(--brick)", borderColor: "var(--brick)" } : {}) }}
                  onClick={() => onPick(r, true)}
                >
                  {nextTaken
                    ? `Cook it double, replacing ${nextDayName}'s dinner with leftovers`
                    : `Cook it double, ${nextDayName} is leftovers`}
                </button>
              )}
            </div>
          ))}
          {shown.length === 0 && <div className="konben-empty">Nothing matches. Try another word.</div>}
        </div>
      </div>
    </div>
  );
}
