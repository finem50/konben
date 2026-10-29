"use client";

import { useState } from "react";
import { LONG_DAYS } from "@/lib/constants";
import { dayNameOf, nextKey } from "@/lib/dates";
import { fmtQty, KEEPS } from "@/lib/format";
import type { PlanEntry, Recipe } from "@/lib/types";

interface RecipeDetailProps {
  recipe: Recipe;
  planned: PlanEntry | null;
  dateKey?: string;
  nextTaken: boolean;
  usageCount: number;
  onServings: (servings: number) => void;
  onCookFor: (nights: 1 | 2) => void;
  onDelete: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export default function RecipeDetail({
  recipe,
  planned,
  dateKey,
  nextTaken,
  usageCount,
  onServings,
  onCookFor,
  onDelete,
  onRemove,
  onClose,
}: RecipeDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const nights = planned ? planned.cookFor || 1 : 1;
  const scale = planned ? (planned.servings * nights) / recipe.servings : 1;
  const nextDay = dateKey ? LONG_DAYS[dayNameOf(nextKey(dateKey))] : null;

  return (
    <div className="konben-scrim" onClick={onClose}>
      <div className="konben-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
          <div>
            <h2 style={{ fontSize: 21, lineHeight: 1.2 }}>{recipe.name}</h2>
            {recipe.subtitle && <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 2 }}>{recipe.subtitle}</div>}
          </div>
          <button className="konben-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          {recipe.prepMinutes && <span className="konben-pill">Prep {recipe.prepMinutes} min</span>}
          <span className="konben-pill">{recipe.prepMinutes ? `Cook ${recipe.minutes - recipe.prepMinutes}` : recipe.minutes} min</span>
          <span className="konben-pill">{recipe.macros.kcal} kcal a plate</span>
          <span className="konben-pill">{recipe.macros.protein}g protein</span>
          <span className="konben-pill" style={recipe.reheat.quality === "great" ? { borderColor: "var(--green)", color: "var(--green)", background: "var(--green-soft)" } : undefined}>
            {KEEPS[recipe.reheat.quality]}
          </span>
        </div>

        {planned && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--mustard-soft)", borderRadius: 3, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>Plates a night</span>
              <button className="konben-btn-ghost" onClick={() => onServings(planned.servings - 1)} aria-label="Fewer servings">
                −
              </button>
              <b style={{ fontSize: 16, minWidth: 16, textAlign: "center" }}>{planned.servings}</b>
              <button className="konben-btn-ghost" onClick={() => onServings(planned.servings + 1)} aria-label="More servings">
                +
              </button>
              <button
                className="konben-btn-ghost"
                style={{ marginLeft: "auto", color: "var(--brick)", borderColor: "var(--brick)" }}
                onClick={onRemove}
              >
                Take off the week
              </button>
            </div>

            <div className="konben-note" style={{ marginBottom: 16 }}>
              {recipe.reheat.quality === "poor" ? (
                <span>{recipe.reheat.how}</span>
              ) : nights === 2 ? (
                <>
                  <div style={{ marginBottom: 8 }}>
                    Cooking {planned.servings * 2} portions. {nextDay} is a no-cook night:{" "}
                    {recipe.reheat.how.charAt(0).toLowerCase() + recipe.reheat.how.slice(1)}
                  </div>
                  <button className="konben-btn-ghost" onClick={() => onCookFor(1)}>
                    Just cook for one night
                  </button>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>{recipe.reheat.how}</div>
                  <button className="konben-btn-ghost" onClick={() => onCookFor(2)}>
                    Cook double, take {nextDay} off
                  </button>
                  {nextTaken && (
                    <div style={{ marginTop: 6, color: "var(--brick)" }}>This replaces the dinner already on {nextDay}.</div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        <h3 style={{ fontSize: 15, marginBottom: 8 }}>
          Ingredients{planned && nights === 2 ? `, for ${planned.servings * 2} portions` : ""}
        </h3>
        <div style={{ marginBottom: 18 }}>
          {recipe.ingredients.map((i, n) => (
            <div className="konben-item" key={n}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="konben-item-name">
                    {i.item}
                    {i.allergens && <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}> (contains {i.allergens.join(", ").toLowerCase()})</span>}
                    {i.staple && <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}> (cupboard)</span>}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtQty(i.qty * scale, i.unit)}</span>
                </div>
                {i.prep && <div className="konben-item-sub">{i.prep}</div>}
              </div>
            </div>
          ))}
        </div>

        {recipe.equipment && (
          <>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Bust out</h3>
            <div style={{ fontSize: 14, marginBottom: 18 }}>{recipe.equipment.join(" · ")}</div>
          </>
        )}

        {recipe.callouts?.map((c) => (
          <div className="konben-note" key={c.title} style={{ marginBottom: 10 }}>
            <b>{c.title}.</b> {c.text}
          </div>
        ))}

        <h3 style={{ fontSize: 15, margin: "8px 0" }}>Method</h3>
        <ol style={{ paddingLeft: 18, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {recipe.steps.map((s, n) => (
            <li key={n} style={{ marginBottom: 10 }}>
              {typeof s === "string" ? (
                s
              ) : (
                <>
                  <b style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: 0.4 }}>{s.title}</b>
                  <ul style={{ paddingLeft: 16, margin: "2px 0" }}>
                    {s.actions.map((a, k) => (
                      <li key={k}>{a}</li>
                    ))}
                  </ul>
                  {s.tip && <div className="konben-item-sub">Tip: {s.tip}</div>}
                </>
              )}
            </li>
          ))}
        </ol>

        {recipe.addOns?.map((a) => (
          <div className="konben-note" key={a.name} style={{ marginTop: 14 }}>
            <b>Add {a.name.toLowerCase()}</b> · {fmtQty(a.qty * scale, a.unit)}, {a.kcal} kcal a plate
            {a.allergens && ` · contains ${a.allergens.join(", ").toLowerCase()}`}
            <ul style={{ paddingLeft: 16, margin: "6px 0 0" }}>
              {a.actions.map((x, k) => (
                <li key={k}>{x}</li>
              ))}
            </ul>
          </div>
        ))}

        <div style={{ borderTop: "1px solid var(--rule)", marginTop: 20, paddingTop: 14 }}>
          {!confirmingDelete ? (
            <button
              className="konben-btn-ghost"
              style={{ color: "var(--brick)", borderColor: "var(--brick)" }}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete this recipe
            </button>
          ) : (
            <div className="konben-note" style={{ background: "var(--brick-soft)" }}>
              <div style={{ marginBottom: 8 }}>
                {usageCount > 0
                  ? `This is on ${usageCount} ${usageCount === 1 ? "night" : "nights"} of your plan. Deleting it clears those nights too.`
                  : "Delete it for good? This can't be undone."}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="konben-btn-ghost" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </button>
                <button
                  className="konben-btn-ghost"
                  style={{ background: "var(--brick)", color: "var(--paper)", borderColor: "var(--brick)" }}
                  onClick={onDelete}
                >
                  Yes, delete it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

