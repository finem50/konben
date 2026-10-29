"use client";

import { useState } from "react";
import { AISLES } from "@/lib/constants";
import { fmtQty } from "@/lib/format";
import type { BuyItem } from "@/lib/types";
import type { Aisle } from "@/lib/constants";

interface BuyListProps {
  items: BuyItem[];
  ticked: Record<string, boolean>;
  onToggle: (key: string) => void;
  onClearTicked: () => void;
}

export default function BuyList({ items, ticked, onToggle, onClearTicked }: BuyListProps) {
  const [showStaples, setShowStaples] = useState(false);
  const [copied, setCopied] = useState(false);

  // Things already in the kitchen get their own card, outside the counts and
  // the copied list. A staple stays with the staples either way.
  const visible = showStaples ? items : items.filter((i) => !i.staple);
  const shown = visible.filter((i) => !i.onHand);
  const onHand = visible.filter((i) => i.onHand).sort((x, y) => x.item.localeCompare(y.item));
  const stapleCount = items.filter((i) => i.staple).length;
  const byAisle: Partial<Record<Aisle, BuyItem[]>> = {};
  for (const i of shown) (byAisle[i.aisle] ??= []).push(i);
  const aisles = AISLES.filter((a) => byAisle[a]?.length);
  for (const a of aisles) byAisle[a]!.sort((x, y) => x.item.localeCompare(y.item));
  const doneCount = shown.filter((i) => ticked[i.key]).length;

  async function copyList() {
    const text = aisles
      .map((a) => `${a}\n` + byAisle[a]!.map((i) => `  ${i.item} — ${fmtQty(i.qty, i.unit)}`).join("\n"))
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="konben-card konben-empty">
        Nothing to buy yet. Plan a dinner and everything its kit needs lands here,
        merged across the week.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ fontSize: 20 }}>
          {shown.length} things to buy across {aisles.length} aisles
          {doneCount > 0 && <span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>{`  ${doneCount} in the basket`}</span>}
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="konben-btn-ghost"
            onClick={() => setShowStaples((s) => !s)}
            style={showStaples ? { borderColor: "var(--ink)", background: "var(--mustard-soft)" } : undefined}
          >
            {showStaples ? "Hide cupboard staples" : `Show ${stapleCount} cupboard staples`}
          </button>
          <button className="konben-btn-ghost" onClick={copyList}>
            {copied ? "Copied" : "Copy list"}
          </button>
          {items.some((i) => ticked[i.key]) && (
            <button className="konben-btn-ghost" onClick={onClearTicked}>
              Untick all
            </button>
          )}
        </div>
      </div>

      <div className="konben-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {[...aisles.map((a) => [a, byAisle[a]!] as const), ...(onHand.length ? [["Already in the kitchen", onHand] as const] : [])].map(([a, lines]) => (
          <section className="konben-card" key={a} style={{ padding: 14, ...(lines === onHand ? { background: "var(--green-soft)" } : {}) }}>
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>{a}</h3>
            {lines === onHand && <p className="konben-item-sub" style={{ marginBottom: 4 }}>Check there&apos;s enough before you shop.</p>}
            {lines.map((i) => (
              <div className="konben-item" key={i.key} data-done={!!ticked[i.key]}>
                <button className="konben-check" onClick={() => onToggle(i.key)} aria-label={`Tick off ${i.item}`}>
                  {ticked[i.key] ? "✓" : ""}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span className="konben-item-name">
                      {i.item}
                      {i.staple && <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}> (staple)</span>}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtQty(i.qty, i.unit)}</span>
                  </div>
                  <div className="konben-item-sub">for {i.from.join(", ")}</div>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
