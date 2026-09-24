/* RunCostBadge — a run's cost (and optionally its token usage) in one mono line.
   Two variants: `compact` → "$0.012" (PR list); `full` → "$0.014 · 8.2K→1.3K"
   (run timeline, verdict banner). Unknown cost renders "—", never "$0.00". */
"use client";

import React from "react";
import { formatCost, formatTokens } from "@/lib/format";
import { s } from "./styles";

export type RunCostBadgeVariant = "compact" | "full";

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: RunCostBadgeVariant;
}) {
  const cost = formatCost(costUsd);
  // Failed/cancelled runs persist 0/0 tokens — nothing worth showing then.
  const hasTokens = tokensIn != null && tokensOut != null && tokensIn + tokensOut > 0;
  const text = variant === "full" && hasTokens ? `${cost} · ${formatTokens(tokensIn, tokensOut)}` : cost;
  return (
    <span className="mono tnum" data-testid="run-cost" style={s.badge(variant, costUsd == null)}>
      {text}
    </span>
  );
}

export default RunCostBadge;
