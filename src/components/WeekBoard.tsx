"use client";

import { useEffect, useState } from "react";
import { DAY_NAMES, LONG_DAYS } from "@/lib/constants";
import { dayNameOf, keyOf } from "@/lib/dates";
import { labelUseBy } from "@/lib/format";
import { pantryMatches, type LeftoverSource, type SwapChange } from "@/lib/planning";
import type { PantryItem, Plan, Recipe } from "@/lib/types";

interface WeekBoardProps {
  days: Date[];
  today: Date;
  plan: Plan;
  recipeById: Record<string, Recipe>;
  leftoverSource: (dateKey: string) => LeftoverSource | null;
  onAdd: (dateKey: string) => void;
  onOpen: (recipeId: string, dateKey: string) => void;
  onClear: (dateKey: string) => void;
  onCookInstead: (dateKey: string, sourceKey: string) => void;
  onClearWeek: () => void;
  pantry: PantryItem[];
  recipes: Recipe[];
  /** Pantry keys ticked for Roll to use first. */
  rollPriority: string[];
  onRollPriority: (keys: string[]) => void;
  onRandomize: (nightKeys: string[]) => void;
  onSwap: (fromKey: string, toKey: string) => SwapChange["downgraded"];
}

export default function WeekBoard({
  days,
  today,
  plan,
  recipeById,
  leftoverSource,
  onAdd,
  onOpen,
  onClear,
  onCookInstead,
  onClearWeek,
  pantry,
  recipes,
  rollPriority,
  onRollPriority,
  onRandomize,
  onSwap,
}: WeekBoardProps) {
  // Weeknights by default: four or five cooking nights is a sensible week.
  const [nights, setNights] = useState(() => DAY_NAMES.map((name) => name !== "Sat" && name !== "Sun"));
  const nightCount = nights.filter(Boolean).length;
  /** The night whose dinner is being moved, by drag or by the move button. */
  const [moving, setMoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!moving) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoving(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moving]);

  function swap(fromKey: string, toKey: string) {
    setMoving(null);
    if (fromKey === toKey) return;
    const downgraded = onSwap(fromKey, toKey);
    setNotice(
      downgraded.length
        ? downgraded
            .map(
              ({ key, recipeId }) =>
                `${recipeById[recipeId]?.name ?? "That dinner"} on ${LONG_DAYS[dayNameOf(key)]} now covers one night: the night after has its own dinner.`
            )
            .join(" ")
        : null
    );
  }

  const todayKey = keyOf(today);
  // Ticks for items since taken off the kitchen list don't count.
  const priority = rollPriority.filter((key) => pantry.some((p) => p.key === key));
  /** Whether any recipe uses the item at all, whatever its date. */
  const usedBySome = (p: PantryItem) => recipes.some((r) => pantryMatches(r, [{ ...p, useBy: null }], todayKey).length);
  const togglePriority = (key: string) =>
    onRollPriority(priority.includes(key) ? priority.filter((k) => k !== key) : [...priority, key]);

  const cookingNights = days.filter((d) => plan[keyOf(d)]).length;
  const offNights = days.filter((d) => leftoverSource(keyOf(d))).length;
  const totalMins = days.reduce((n, d) => {
    const e = plan[keyOf(d)];
    const r = e && recipeById[e.recipeId];
    return n + (r ? r.minutes : 0);
  }, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 20 }}>
          {cookingNights === 0
            ? "No dinners planned yet"
            : `${cookingNights} nights at the stove, ${totalMins} minutes total` +
              (offNights ? `, ${offNights} night${offNights > 1 ? "s" : ""} off` : "")}
        </h2>
        {cookingNights > 0 && (
          <button className="konben-btn-ghost" onClick={onClearWeek}>
            Clear the week
          </button>
        )}
      </div>

      <div className="konben-roll">
        <span>Random dinners on</span>
        {DAY_NAMES.map((name, i) => (
          <button
            key={name}
            className="konben-btn-ghost konben-toggle"
            aria-pressed={nights[i]}
            onClick={() => setNights((prev) => prev.map((on, j) => (j === i ? !on : on)))}
          >
            {name}
          </button>
        ))}
        <button
          className="konben-btn"
          disabled={nightCount === 0}
          onClick={() => onRandomize(days.filter((_, i) => nights[i]).map(keyOf))}
        >
          {cookingNights > 0 ? "Reroll" : "Roll"} {nightCount} dinner{nightCount === 1 ? "" : "s"}
        </button>
      </div>

      {pantry.length > 0 && (
        <fieldset className="konben-roll konben-prio">
          <legend>
            {priority.length
              ? "Roll gives each ticked item a dinner first"
              : "Tick kitchen items for Roll to use first (otherwise it uses what goes off soonest)"}
          </legend>
          {pantry.map((p) => {
            const usable = usedBySome(p);
            return (
              <label key={p.key} data-off={!usable} title={usable ? undefined : "No recipe uses this"}>
                <input
                  type="checkbox"
                  checked={priority.includes(p.key)}
                  disabled={!usable}
                  onChange={() => togglePriority(p.key)}
                />
                {p.item}
                {p.useBy && <small>{labelUseBy(p.useBy, todayKey)}</small>}
              </label>
            );
          })}
          {priority.length > 0 && (
            <button className="konben-btn-ghost konben-toggle" onClick={() => onRollPriority([])}>
              Untick all
            </button>
          )}
        </fieldset>
      )}

      {moving && (
        <p className="konben-note" style={{ marginBottom: 10 }}>
          Tap the night to move {recipeById[plan[moving]?.recipeId ?? ""]?.name ?? "it"} to. A night with a dinner swaps with it.{" "}
          <button className="konben-btn-ghost" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => setMoving(null)}>
            Cancel
          </button>
        </p>
      )}

      {notice && !moving && (
        <p className="konben-note" style={{ marginBottom: 10 }}>
          {notice}{" "}
          <button className="konben-btn-ghost" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => setNotice(null)}>
            OK
          </button>
        </p>
      )}

      <div className="konben-week">
        {days.map((d, i) => {
          const k = keyOf(d);
          const entry = plan[k];
          const r = entry && recipeById[entry.recipeId];
          const lo = !entry && leftoverSource(k);
          const loRecipe = lo && recipeById[lo.entry.recipeId];
          const isToday = k === keyOf(today);

          return (
            <div
              className="konben-card konben-day"
              key={k}
              data-today={isToday}
              data-target={!!moving && moving !== k}
              data-dragging={moving === k}
              onDragOver={(e) => {
                if (moving) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (moving) swap(moving, k);
              }}
              onClickCapture={(e) => {
                // While moving, a tap anywhere on another night is the drop.
                if (!moving || moving === k) return;
                e.preventDefault();
                e.stopPropagation();
                swap(moving, k);
              }}
            >
              <div className="konben-daytop">
                <b>{DAY_NAMES[i]}</b>
                <i>{d.getDate()}</i>
              </div>

              {r && (
                <div
                  style={{ position: "relative", display: "flex", flex: 1 }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", k);
                    setMoving(k);
                  }}
                  onDragEnd={() => setMoving(null)}
                >
                  <button className="konben-chip" onClick={() => onOpen(r.id, k)}>
                    <b style={{ paddingRight: 34 }}>{r.name}</b>
                    <span>{r.minutes} minutes at the stove</span>
                    <span>
                      {entry.cookFor === 2
                        ? `${entry.servings * 2} portions, ${entry.servings} a night`
                        : `serves ${entry.servings}`}
                    </span>
                    {entry.cookFor === 2 && <em>Covers tomorrow too</em>}
                  </button>
                  <button
                    className="konben-move"
                    onClick={() => setMoving(moving === k ? null : k)}
                    aria-label={`Move ${r.name} to another night`}
                    aria-pressed={moving === k}
                    title="Move to another night"
                    style={{ right: 22 }}
                  >
                    ⇄
                  </button>
                  <button
                    className="konben-move"
                    onClick={() => onClear(k)}
                    aria-label={`Remove ${r.name}`}
                  >
                    ×
                  </button>
                </div>
              )}

              {loRecipe && (
                <div className="konben-left">
                  <em>No cooking</em>
                  <b>{loRecipe.name}</b>
                  <span>Leftovers from {LONG_DAYS[dayNameOf(lo.key)]}</span>
                  <span style={{ marginTop: 6 }}>{loRecipe.reheat.how}</span>
                  <button
                    className="konben-btn-ghost"
                    style={{ marginTop: 8, fontSize: 12, padding: "5px 9px" }}
                    onClick={() => onCookInstead(k, lo.key)}
                  >
                    Cook something instead
                  </button>
                </div>
              )}

              {!r && !lo && (
                <button className="konben-add" onClick={() => onAdd(k)}>
                  + Pick a dinner
                </button>
              )}
            </div>
          );
        })}
      </div>

      {cookingNights === 0 && (
        <p style={{ marginTop: 16, fontSize: 14, color: "var(--muted)", maxWidth: "62ch" }}>
          Pick a dinner for each night. Anything that keeps can be cooked once for
          two nights, which turns the night after into a no-cook night and buys the
          ingredients only once.
        </p>
      )}
    </div>
  );
}
