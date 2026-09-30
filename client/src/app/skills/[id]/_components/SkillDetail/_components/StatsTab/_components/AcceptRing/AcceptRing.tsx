/* AcceptRing — small SVG progress ring for the accept rate (empty track when null). */
"use client";

import React from "react";
import { acceptRateColor } from "@/app/skills/rates";

export function AcceptRing({ rate, size = 34, stroke = 4 }: { rate: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = rate == null ? 0 : Math.min(Math.max(rate, 0), 1);
  return (
    <svg width={size} height={size} aria-hidden style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={stroke} />
      {filled > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={acceptRateColor(rate)}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - filled)}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
