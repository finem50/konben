"use client";

import { useMemo, useState } from "react";
import AddRecipeForm from "./AddRecipeForm";
import BuyList from "./BuyList";
import Kits from "./Kits";
import Macros from "./Macros";
import Pantry from "./Pantry";
import RecipeDetail from "./RecipeDetail";
import { RecipeLibrary, RecipePicker } from "./RecipeLibrary";
import WeekBoard from "./WeekBoard";
import { useKitchenState } from "@/hooks/useKitchenState";
import { LONG_DAYS } from "@/lib/constants";
import { addDays, dayNameOf, keyOf, nextKey, sundayOf } from "@/lib/dates";
import { shortDate } from "@/lib/format";
import { buildBuyList, buildKits, leftoverSource as leftoverSourceOf, pantryMatches } from "@/lib/planning";

type Tab = "week" | "kits" | "buy" | "kitchen" | "recipes" | "macros";

export default function Konben() {
  const {
    recipes,
    plan,
    goals,
    ticked,
    packed,
    pantry,
    assign,
    clearDay,
    setServings,
    setCookFor,
    swapNights,
    clearWeek,
    randomizeWeek,
    setGoals,
    toggleCheck,
    clearChecks,
    saveRecipe,
    deleteRecipe,
    addPantryItem,
    removePantryItem,
    saveError,
  } = useKitchenState();

  const [weekOffset, setWeekOffset] = useState(0);
  const [tab, setTab] = useState<Tab>("week");
  const [picker, setPicker] = useState<{ dateKey: string } | null>(null);
  const [detail, setDetail] = useState<{ recipeId: string; dateKey?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  // Kitchen items ticked on the week page for Roll to use first. Kept here, not
  // on the server, so it lasts while the tab is switched but not past a reload.
  const [rollPriority, setRollPriority] = useState<string[]>([]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const weekStart = useMemo(
    () => addDays(sundayOf(today), weekOffset * 7),
    [today, weekOffset]
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const recipeById = useMemo(
    () => Object.fromEntries(recipes.map((r) => [r.id, r])),
    [recipes]
  );

  const leftoverSource = useMemo(
    () => (dateKey: string) => leftoverSourceOf(plan, dateKey),
    [plan]
  );

  const kits = useMemo(() => buildKits(days, plan, recipeById), [days, plan, recipeById]);
  const buyList = useMemo(() => buildBuyList(kits, keyOf(weekStart), pantry), [kits, weekStart, pantry]);
  const todayKey = keyOf(today);

  // Kitchen items another night this week already uses, so the picker for
  // `picker.dateKey` can lean toward the rest.
  const covered = useMemo(() => {
    const keys = new Set<string>();
    for (const d of days) {
      const k = keyOf(d);
      const recipe = k !== picker?.dateKey && plan[k] && recipeById[plan[k]!.recipeId];
      if (recipe) for (const m of pantryMatches(recipe, pantry, k)) keys.add(m.item.key);
    }
    return keys;
  }, [days, plan, recipeById, pantry, picker]);

  const recipeUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of Object.values(plan)) {
      if (entry) counts[entry.recipeId] = (counts[entry.recipeId] || 0) + 1;
    }
    return counts;
  }, [plan]);

  const weekLabel = `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;

  return (
    <div className="konben">
      <div className="konben-shell">
        <header className="konben-top">
          <div className="konben-mark">
            <h1>Konben</h1>
            <span>dinners, kitted and portioned</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="konben-btn-ghost"
              onClick={() => setWeekOffset((w) => w - 1)}
              aria-label="Previous week"
            >
              ‹
            </button>
            <span style={{ fontSize: 14, minWidth: 130, textAlign: "center" }}>{weekLabel}</span>
            <button
              className="konben-btn-ghost"
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label="Next week"
            >
              ›
            </button>
          </div>
        </header>

        {saveError && (
          <p
            role="alert"
            style={{ margin: "0 0 12px", padding: "8px 12px", border: "2px solid var(--brick)", background: "var(--brick-soft)", color: "var(--ink)" }}
          >
            Not saved: {saveError}. Reload to see what&apos;s stored.
          </p>
        )}

        <nav className="konben-tabs">
          {(
            [
              ["week", "Week"],
              ["kits", `Kits (${kits.length})`],
              ["buy", `Buy list (${buyList.length})`],
              ["kitchen", `Kitchen (${pantry.length})`],
              ["recipes", `Recipes (${recipes.length})`],
              ["macros", "Macros"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              className="konben-tab"
              data-on={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "week" && (
          <WeekBoard
            days={days}
            today={today}
            plan={plan}
            recipeById={recipeById}
            leftoverSource={leftoverSource}
            onAdd={(dateKey) => setPicker({ dateKey })}
            onOpen={(recipeId, dateKey) => setDetail({ recipeId, dateKey })}
            onClear={clearDay}
            onCookInstead={(dateKey, srcKey) => {
              setCookFor(srcKey, 1);
              setPicker({ dateKey });
            }}
            onClearWeek={() => clearWeek(days)}
            pantry={pantry}
            recipes={recipes}
            rollPriority={rollPriority}
            onRollPriority={setRollPriority}
            onRandomize={(nightKeys) => randomizeWeek(days, nightKeys, rollPriority)}
            onSwap={swapNights}
          />
        )}

        {tab === "kits" && (
          <Kits
            kits={kits}
            packed={packed}
            onPack={(key) => toggleCheck("packed", key)}
            onServings={setServings}
          />
        )}

        {tab === "buy" && (
          <BuyList
            items={buyList}
            ticked={ticked}
            onToggle={(key) => toggleCheck("ticked", key)}
            onClearTicked={() => clearChecks("ticked", days)}
          />
        )}

        {tab === "kitchen" && (
          <Pantry
            pantry={pantry}
            recipes={recipes}
            days={days}
            plan={plan}
            recipeById={recipeById}
            todayKey={todayKey}
            onAdd={addPantryItem}
            onRemove={removePantryItem}
          />
        )}

        {tab === "recipes" && (
          <RecipeLibrary
            recipes={recipes}
            pantry={pantry}
            todayKey={todayKey}
            onOpen={(id) => setDetail({ recipeId: id })}
            onAddNew={() => setAdding(true)}
          />
        )}

        {tab === "macros" && (
          <Macros
            days={days}
            today={today}
            plan={plan}
            recipeById={recipeById}
            leftoverSource={leftoverSource}
            goals={goals}
            setGoals={setGoals}
          />
        )}
      </div>

      {picker && (
        <RecipePicker
          recipes={recipes}
          pantry={pantry}
          dateKey={picker.dateKey}
          covered={covered}
          todayKey={todayKey}
          onPick={(recipe, twoNights) => {
            assign(picker.dateKey, recipe);
            if (twoNights) setCookFor(picker.dateKey, 2);
            setPicker(null);
          }}
          nextDayName={LONG_DAYS[dayNameOf(nextKey(picker.dateKey))]}
          nextTaken={!!plan[nextKey(picker.dateKey)]}
          onClose={() => setPicker(null)}
        />
      )}

      {detail && recipeById[detail.recipeId] && (
        <RecipeDetail
          recipe={recipeById[detail.recipeId]}
          planned={detail.dateKey ? plan[detail.dateKey] ?? null : null}
          dateKey={detail.dateKey}
          nextTaken={detail.dateKey ? !!plan[nextKey(detail.dateKey)] : false}
          usageCount={recipeUsage[detail.recipeId] || 0}
          onServings={(n) => detail.dateKey && setServings(detail.dateKey, n)}
          onCookFor={(n) => detail.dateKey && setCookFor(detail.dateKey, n)}
          onDelete={() => {
            deleteRecipe(detail.recipeId);
            setDetail(null);
          }}
          onRemove={() => {
            if (detail.dateKey) clearDay(detail.dateKey);
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      )}

      {adding && (
        <AddRecipeForm
          onSave={(recipe) => {
            saveRecipe(recipe);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
