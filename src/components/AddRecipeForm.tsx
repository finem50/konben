"use client";

import { useState } from "react";
import { AISLES, type Aisle } from "@/lib/constants";
import { KEEPS } from "@/lib/format";
import { RecipeSchema } from "@/lib/schema";
import type { Callout, DraftRecipe, ReheatQuality, Step } from "@/lib/types";

interface IngredientRow {
  rowId: number;
  item: string;
  qty: string;
  unit: string;
  aisle: Aisle;
  prep: string;
  allergens: string;
  staple: boolean;
}

/** A method step in the card format: a title, its actions one a line, and a tip. */
interface StepRow {
  rowId: number;
  title: string;
  actions: string;
  tip: string;
}

interface CalloutRow {
  rowId: number;
  title: string;
  text: string;
}

let rowSeq = 0;
const newIngredientRow = (): IngredientRow => ({
  rowId: ++rowSeq,
  item: "",
  qty: "",
  unit: "",
  aisle: "Produce",
  prep: "",
  allergens: "",
  staple: false,
});
const newStepRow = (): StepRow => ({ rowId: ++rowSeq, title: "", actions: "", tip: "" });
const newCalloutRow = (): CalloutRow => ({ rowId: ++rowSeq, title: "", text: "" });

/** "Milk, Wheat" -> ["Milk", "Wheat"]; blank -> undefined, so the field is left off. */
function list(value: string): string[] | undefined {
  const items = value.split(",").map((v) => v.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

/** Keep a row's edits in one place for each kind of row. */
function useRows<T extends { rowId: number }>(make: () => T, initial: number) {
  const [rows, setRows] = useState(() => Array.from({ length: initial }, make));
  return {
    rows,
    update: (rowId: number, patch: Partial<T>) =>
      setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r))),
    remove: (rowId: number) => setRows((rs) => rs.filter((r) => r.rowId !== rowId)),
    add: () => setRows((rs) => [...rs, make()]),
  };
}

interface AddRecipeFormProps {
  onSave: (recipe: DraftRecipe) => void;
  onClose: () => void;
}

export default function AddRecipeForm({ onSave, onClose }: AddRecipeFormProps) {
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [prepMinutes, setPrepMinutes] = useState("");
  const [servings, setServings] = useState("2");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [quality, setQuality] = useState<ReheatQuality>("ok");
  const [reheatHow, setReheatHow] = useState("");
  const [equipment, setEquipment] = useState("");
  const ingredientRows = useRows(newIngredientRow, 3);
  const stepRows = useRows(newStepRow, 2);
  const calloutRows = useRows(newCalloutRow, 0);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) {
      setError("Give the dinner a name.");
      return;
    }
    const ingredients = ingredientRows.rows
      .filter((r) => r.item.trim())
      .map((r) => ({
        item: r.item.trim(),
        qty: Number(r.qty) || 1,
        unit: r.unit.trim() || null,
        aisle: r.aisle,
        prep: r.prep.trim() || undefined,
        staple: r.staple,
        allergens: list(r.allergens),
      }));
    if (ingredients.length === 0) {
      setError("Add at least one ingredient.");
      return;
    }
    const methodSteps: Step[] = [];
    for (const [i, r] of stepRows.rows.entries()) {
      const title = r.title.trim();
      const actions = r.actions.split("\n").map((a) => a.trim()).filter(Boolean);
      const tip = r.tip.trim();
      if (!title && !actions.length && !tip) continue;
      if (!title || !actions.length) {
        setError(`Step ${i + 1} needs ${title ? "at least one action" : "a title"}.`);
        return;
      }
      methodSteps.push(tip ? { title, actions, tip } : { title, actions });
    }
    if (methodSteps.length === 0) {
      setError("Write at least one step of the method.");
      return;
    }
    const callouts: Callout[] = [];
    for (const r of calloutRows.rows) {
      const title = r.title.trim();
      const text = r.text.trim();
      if (!title && !text) continue;
      if (!title || !text) {
        setError("A callout needs both a title and its text.");
        return;
      }
      callouts.push({ title, text });
    }
    const wholeMinutes = Number(minutes || 30);
    const prep = prepMinutes.trim() ? Number(prepMinutes) : undefined;
    const serves = Number(servings || 2);
    if (!Number.isInteger(wholeMinutes) || wholeMinutes < 1) {
      setError("Minutes has to be a whole number, 1 or more.");
      return;
    }
    if (!Number.isInteger(serves) || serves < 1) {
      setError("Serves has to be a whole number, 1 or more.");
      return;
    }
    if (prep !== undefined && (!Number.isInteger(prep) || prep < 1 || prep > wholeMinutes)) {
      setError("Prep minutes has to be a whole number, 1 or more, and no longer than the total.");
      return;
    }
    const draft: DraftRecipe = {
      name: name.trim(),
      subtitle: subtitle.trim() || undefined,
      minutes: wholeMinutes,
      prepMinutes: prep,
      servings: serves,
      macros: {
        kcal: Number(kcal) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
      },
      reheat: {
        quality,
        how: reheatHow.trim() || (quality === "poor" ? "Best eaten the night it's cooked." : "Keeps a couple of days in the fridge."),
      },
      ingredients,
      steps: methodSteps,
      equipment: list(equipment),
      callouts: callouts.length ? callouts : undefined,
    };
    // The server checks against the same schema; catching it here means a
    // recipe it would refuse never reaches the library in the first place.
    const checked = RecipeSchema.safeParse({ ...draft, id: "draft" });
    if (!checked.success) {
      // By this point the only thing left to trip it is a negative number.
      const issue = checked.error.issues[0];
      const [field, index] = issue.path;
      setError(
        field === "ingredients" && typeof index === "number"
          ? `The quantity for ${ingredients[index].item} can't be negative.`
          : field === "macros"
            ? "Macros can't be negative."
            : `Check the form: ${issue.message}`
      );
      return;
    }
    onSave(draft);
  }

  return (
    <div className="konben-scrim" onClick={onClose}>
      <div className="konben-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <h2 style={{ fontSize: 20 }}>Add a recipe</h2>
          <button className="konben-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 14 }}>
          Name
          <input className="konben-input" style={{ marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Turkey meatball traybake" autoFocus />
        </label>

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 14 }}>
          The line under the name (optional)
          <input className="konben-input" style={{ marginTop: 4 }} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="with a lemony herb crumb" />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            Minutes in all
            <input className="konben-input" style={{ marginTop: 4 }} type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            Of which prep
            <input className="konben-input" style={{ marginTop: 4 }} type="number" min="1" value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value)} placeholder="optional" />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            Serves
            <input className="konben-input" style={{ marginTop: 4 }} type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} />
          </label>
        </div>

        <h3 className="konben-sub" style={{ marginTop: 0 }}>
          Macros a plate
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
          {(
            [
              ["kcal", kcal, setKcal],
              ["protein g", protein, setProtein],
              ["carbs g", carbs, setCarbs],
              ["fat g", fat, setFat],
            ] as [string, string, (value: string) => void][]
          ).map(([label, val, setter]) => (
            <label key={label} style={{ fontSize: 11, color: "var(--muted)" }}>
              {label}
              <input className="konben-input" style={{ marginTop: 4 }} type="number" min="0" value={val} onChange={(e) => setter(e.target.value)} />
            </label>
          ))}
        </div>

        <h3 className="konben-sub" style={{ marginTop: 0 }}>
          Keeping it overnight
        </h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {(Object.entries(KEEPS) as [ReheatQuality, string][]).map(([id, label]) => (
            <button
              key={id}
              className="konben-btn-ghost"
              onClick={() => setQuality(id)}
              style={quality === id ? { borderColor: "var(--ink)", background: "var(--mustard-soft)" } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="konben-input"
          style={{ marginBottom: 18 }}
          placeholder={quality === "poor" ? "Why it doesn't hold (optional)" : "How to reheat it or serve it cold (optional)"}
          value={reheatHow}
          onChange={(e) => setReheatHow(e.target.value)}
        />

        <h3 className="konben-sub" style={{ marginTop: 0 }}>
          Ingredients
        </h3>
        <div style={{ marginBottom: 8 }}>
          {ingredientRows.rows.map((r) => (
            <div key={r.rowId} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="konben-input"
                style={{ flex: "2 1 140px" }}
                placeholder="Ingredient"
                value={r.item}
                onChange={(e) => ingredientRows.update(r.rowId, { item: e.target.value })}
              />
              <input
                className="konben-input"
                style={{ flex: "0 1 64px" }}
                placeholder="Qty"
                type="number"
                min="0"
                value={r.qty}
                onChange={(e) => ingredientRows.update(r.rowId, { qty: e.target.value })}
              />
              <input
                className="konben-input"
                style={{ flex: "0 1 72px" }}
                placeholder="unit"
                value={r.unit}
                onChange={(e) => ingredientRows.update(r.rowId, { unit: e.target.value })}
              />
              <select
                className="konben-input"
                style={{ flex: "0 1 110px" }}
                value={r.aisle}
                onChange={(e) => ingredientRows.update(r.rowId, { aisle: e.target.value as Aisle })}
              >
                {AISLES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <input
                className="konben-input"
                style={{ flex: "1 1 130px" }}
                placeholder="Prep, e.g. Dice"
                value={r.prep}
                onChange={(e) => ingredientRows.update(r.rowId, { prep: e.target.value })}
              />
              <input
                className="konben-input"
                style={{ flex: "1 1 110px" }}
                placeholder="Allergens, e.g. Milk"
                value={r.allergens}
                onChange={(e) => ingredientRows.update(r.rowId, { allergens: e.target.value })}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={r.staple} onChange={(e) => ingredientRows.update(r.rowId, { staple: e.target.checked })} />
                staple
              </label>
              <button
                className="konben-btn-ghost"
                style={{ padding: "7px 9px", color: "var(--brick)", borderColor: "var(--brick)" }}
                onClick={() => ingredientRows.remove(r.rowId)}
                aria-label="Remove ingredient"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button className="konben-btn-ghost" onClick={ingredientRows.add} style={{ marginBottom: 18 }}>
          + Add ingredient
        </button>

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 18 }}>
          Equipment, comma separated (optional)
          <input className="konben-input" style={{ marginTop: 4 }} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Large pan, Baking sheet" />
        </label>

        <h3 className="konben-sub" style={{ marginTop: 0 }}>
          Method
        </h3>
        {stepRows.rows.map((r, i) => (
          <div key={r.rowId} style={{ border: "1px solid var(--rule)", padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 18 }}>{i + 1}</span>
              <input
                className="konben-input"
                placeholder="Step title, e.g. Cook the mushrooms"
                value={r.title}
                onChange={(e) => stepRows.update(r.rowId, { title: e.target.value })}
              />
              <button
                className="konben-btn-ghost"
                style={{ padding: "7px 9px", color: "var(--brick)", borderColor: "var(--brick)" }}
                onClick={() => stepRows.remove(r.rowId)}
                aria-label={`Remove step ${i + 1}`}
              >
                ×
              </button>
            </div>
            <textarea
              className="konben-input"
              style={{ minHeight: 64, marginBottom: 6, resize: "vertical", fontFamily: "inherit" }}
              value={r.actions}
              onChange={(e) => stepRows.update(r.rowId, { actions: e.target.value })}
              placeholder={"What to do, one action a line.\nHeat a drizzle of oil in a large pan over medium-high."}
              aria-label={`Step ${i + 1} actions`}
            />
            <input
              className="konben-input"
              placeholder="Tip (optional)"
              value={r.tip}
              onChange={(e) => stepRows.update(r.rowId, { tip: e.target.value })}
            />
          </div>
        ))}
        <button className="konben-btn-ghost" onClick={stepRows.add} style={{ marginBottom: 18 }}>
          + Add step
        </button>

        <h3 className="konben-sub" style={{ marginTop: 0 }}>
          Callouts (optional)
        </h3>
        {calloutRows.rows.map((r) => (
          <div key={r.rowId} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="konben-input"
              style={{ flex: "1 1 140px" }}
              placeholder="Title, e.g. Check on it"
              value={r.title}
              onChange={(e) => calloutRows.update(r.rowId, { title: e.target.value })}
            />
            <input
              className="konben-input"
              style={{ flex: "3 1 220px" }}
              placeholder="What the cook should know"
              value={r.text}
              onChange={(e) => calloutRows.update(r.rowId, { text: e.target.value })}
            />
            <button
              className="konben-btn-ghost"
              style={{ padding: "7px 9px", color: "var(--brick)", borderColor: "var(--brick)" }}
              onClick={() => calloutRows.remove(r.rowId)}
              aria-label="Remove callout"
            >
              ×
            </button>
          </div>
        ))}
        <button className="konben-btn-ghost" onClick={calloutRows.add} style={{ marginBottom: 18 }}>
          + Add callout
        </button>

        {error && <div style={{ fontSize: 13, color: "var(--brick)", marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="konben-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="konben-btn" onClick={submit}>
            Save recipe
          </button>
        </div>
      </div>
    </div>
  );
}

