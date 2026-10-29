"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DAY_NAMES } from "@/lib/constants";
import { keyOf, parseKey } from "@/lib/dates";
import type { LeftoverSource } from "@/lib/planning";
import type { Goals, Plan, Recipe } from "@/lib/types";

interface MacrosProps {
  days: Date[];
  today: Date;
  plan: Plan;
  recipeById: Record<string, Recipe>;
  leftoverSource: (dateKey: string) => LeftoverSource | null;
  goals: Goals;
  setGoals: (update: (previous: Goals) => Goals) => void;
}

export default function Macros({
  days,
  today,
  plan,
  recipeById,
  leftoverSource,
  goals,
  setGoals,
}: MacrosProps) {
  const perDay = days.map((d, i) => {
    const k = keyOf(d);
    const entry = plan[k];
    const lo = !entry && leftoverSource(k);
    const r = entry ? recipeById[entry.recipeId] : lo ? recipeById[lo.entry.recipeId] : null;
    return {
      day: DAY_NAMES[i],
      key: k,
      name: r ? r.name : null,
      leftovers: !!lo,
      kcal: r ? r.macros.kcal : 0,
      protein: r ? r.macros.protein : 0,
      carbs: r ? r.macros.carbs : 0,
      fat: r ? r.macros.fat : 0,
    };
  });

  const [selected, setSelected] = useState(() => keyOf(today));
  const active = perDay.find((p) => p.key === selected) || perDay[0];
  const eaten = perDay.filter((p) => p.name);
  const avg = (k: keyof Goals) =>
    eaten.length ? eaten.reduce((n, p) => n + p[k], 0) / eaten.length : 0;

  const rows: [string, number, number, string, keyof Goals][] = [
    ["Calories", active.kcal, goals.kcal, "kcal", "kcal"],
    ["Protein", active.protein, goals.protein, "g", "protein"],
    ["Carbs", active.carbs, goals.carbs, "g", "carbs"],
    ["Fat", active.fat, goals.fat, "g", "fat"],
  ];

  return (
    <div className="konben-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      <section className="konben-card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 2 }}>
          {parseKey(active.key).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
          {active.name
            ? `${active.name}${active.leftovers ? ", reheated from the night before" : ", a plate's worth"}`
            : "Nothing planned for this night."}
        </p>

        {rows.map(([label, value, goal, unit, id]) => {
          const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
          const over = value > goal;
          return (
            <div key={id} style={{ marginBottom: 14 }}>
              <div className="konben-stat">
                <b>{Math.round(value)}</b>
                <span>
                  {unit} of {goal} {label.toLowerCase()}
                </span>
              </div>
              <div className="konben-bar" data-over={over}>
                <div style={{ width: `${pct}%` }} />
              </div>
              {over && (
                <div style={{ fontSize: 12, color: "var(--brick)", marginTop: 4 }}>
                  {Math.round(value - goal)} {unit} over
                </div>
              )}
            </div>
          );
        })}

        {eaten.length > 0 && (
          <p style={{ fontSize: 13, color: "var(--muted)", borderTop: "1px solid var(--rule)", paddingTop: 12, margin: "16px 0 0" }}>
            Across {eaten.length} dinners the average plate is {Math.round(avg("kcal"))} kcal with{" "}
            {Math.round(avg("protein"))}g protein.
          </p>
        )}
      </section>

      <section className="konben-card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Calories a plate, across the week</h2>
        <div style={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={perDay}
              margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
              onClick={(e) => {
                const point = (e as { activePayload?: { payload: { key: string } }[] })
                  ?.activePayload?.[0];
                if (point) setSelected(point.payload.key);
              }}
            >
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#5E5E5A" }} axisLine={{ stroke: "#D6D6D0" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#5E5E5A" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(22,48,43,.06)" }}
                contentStyle={{ border: "1px solid #111111", borderRadius: 3, fontSize: 12, fontFamily: "IBM Plex Sans, sans-serif" }}
              />
              <ReferenceLine y={goals.kcal} stroke="#111111" strokeDasharray="3 3" />
              <Bar dataKey="kcal" radius={[2, 2, 0, 0]}>
                {perDay.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.kcal > goals.kcal ? "#D62828" : "#1E8E4E"}
                    fillOpacity={d.leftovers ? 0.4 : 1}
                    opacity={d.key === active.key ? 1 : 0.6}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          Paler bars are leftovers nights. Pick a bar to see that night broken down.
        </p>

        <h3 style={{ fontSize: 15, margin: "20px 0 10px" }}>What you want out of dinner</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(
            [
              ["kcal", "Calories"],
              ["protein", "Protein (g)"],
              ["carbs", "Carbs (g)"],
              ["fat", "Fat (g)"],
            ] as [keyof Goals, string][]
          ).map(([k, label]) => (
            <label key={k} style={{ fontSize: 12, color: "var(--muted)" }}>
              {label}
              <input
                className="konben-input"
                type="number"
                min="0"
                value={goals[k]}
                onChange={(e) => setGoals((g) => ({ ...g, [k]: Number(e.target.value) || 0 }))}
                style={{ marginTop: 4 }}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
