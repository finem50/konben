"use client";

import { useState } from "react";
import { fmtQty, shortDate } from "@/lib/format";
import type { Kit } from "@/lib/types";

interface KitsProps {
  kits: Kit[];
  packed: Record<string, boolean>;
  onPack: (key: string) => void;
  onServings: (dateKey: string, servings: number) => void;
}

export default function Kits({ kits, packed, onPack, onServings }: KitsProps) {
  if (kits.length === 0) {
    return (
      <div className="konben-card konben-empty">
        Kits build themselves from the week board. Pick a dinner and its bag shows
        up here, portioned to the nights it covers.
      </div>
    );
  }
  const doubles = kits.filter((k) => k.nights === 2).length;

  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 14px", maxWidth: "62ch" }}>
        One bag a cooking night, portioned and with the knife work written on each
        line.
        {doubles > 0 &&
          ` ${doubles} ${doubles === 1 ? "kit is" : "kits are"} sized for two nights, so set the second night's portions aside before you sit down.`}
      </p>
      <div className="konben-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {kits.map((kit) => (
          <KitCard key={kit.key} kit={kit} packed={packed} onPack={onPack} onServings={onServings} />
        ))}
      </div>
    </div>
  );
}

function KitCard({ kit, packed, onPack, onServings }: { kit: Kit } & Omit<KitsProps, "kits">) {
  const [copied, setCopied] = useState(false);

  async function copyLabel() {
    const text = [
      `${kit.dayName} ${shortDate(kit.date)} — ${kit.recipe.name}`,
      kit.nights === 2
        ? `${kit.portions} portions: ${kit.servings} for ${kit.dayName}, ${kit.servings} for ${kit.nextDayName}`
        : `Serves ${kit.servings}`,
      `${kit.recipe.minutes} minutes`,
      "",
      "In the bag:",
      ...kit.contents.map((c) => `  ${c.item} ${fmtQty(c.qty, c.unit)}${c.prep ? ` (${c.prep.toLowerCase()})` : ""}`),
      "",
      "From the cupboard:",
      ...kit.cupboard.map((c) => `  ${c.item} ${fmtQty(c.qty, c.unit)}`),
      ...(kit.nights === 2 ? ["", `${kit.nextDayName}: ${kit.recipe.reheat.how}`] : []),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="konben-card" style={{ padding: 14, borderColor: kit.nights === 2 ? "var(--mustard)" : "var(--rule)" }}>
      <div className="konben-kit-head">
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {kit.nights === 2
              ? `${kit.dayName} and ${kit.nextDayName}, ${shortDate(kit.date)}`
              : `${kit.dayName} ${shortDate(kit.date)}`}
          </div>
          <h3 style={{ fontSize: 16, lineHeight: 1.25, marginTop: 2 }}>{kit.recipe.name}</h3>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{kit.recipe.minutes} min</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Plates a night</span>
        <button className="konben-btn-ghost" onClick={() => onServings(kit.key, kit.servings - 1)} aria-label="Fewer servings">
          −
        </button>
        <b style={{ fontSize: 15, minWidth: 14, textAlign: "center" }}>{kit.servings}</b>
        <button className="konben-btn-ghost" onClick={() => onServings(kit.key, kit.servings + 1)} aria-label="More servings">
          +
        </button>
        <button className="konben-btn-ghost" style={{ marginLeft: "auto" }} onClick={copyLabel}>
          {copied ? "Copied" : "Copy label"}
        </button>
      </div>

      {kit.nights === 2 && (
        <div className="konben-note" style={{ marginBottom: 4 }}>
          Cooking {kit.portions} portions. Box {kit.servings} for {kit.nextDayName} before you serve, then:{" "}
          {kit.recipe.reheat.how.charAt(0).toLowerCase() + kit.recipe.reheat.how.slice(1)}
        </div>
      )}

      <h4 className="konben-sub">In the bag</h4>
      <div>
        {kit.contents.map((c) => {
          const key = `${kit.key}|${c.item}`;
          return (
            <div className="konben-item" key={key} data-done={!!packed[key]}>
              <button className="konben-check" onClick={() => onPack(key)} aria-label={`Pack ${c.item}`}>
                {packed[key] ? "✓" : ""}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="konben-item-name">{c.item}</span>
                  <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtQty(c.qty, c.unit)}</span>
                </div>
                {c.prep && <div className="konben-item-sub">{c.prep}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {kit.cupboard.length > 0 && (
        <>
          <h4 className="konben-sub">From your cupboard, not the bag</h4>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            {kit.cupboard.map((c) => `${c.item} ${fmtQty(c.qty, c.unit)}`).join(", ")}
          </div>
        </>
      )}
    </section>
  );
}
