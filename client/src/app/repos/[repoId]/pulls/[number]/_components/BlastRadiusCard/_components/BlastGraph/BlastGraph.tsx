/* BlastGraph — hierarchical node-link SVG: changed symbols → callers → endpoints affected. */
"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { buildGraphLayout, NODE_H } from "./layout";
import { s, svgText } from "./styles";

interface BlastGraphProps {
  downstream: BlastRadiusResponse["downstream"];
}

export function BlastGraph({ downstream }: BlastGraphProps) {
  const t = useTranslations("blast");
  const layout = useMemo(() => buildGraphLayout(downstream), [downstream]);

  if (layout.nodes.length === 0) return <div style={s.empty}>{t("graph.empty")}</div>;

  return (
    <div>
      <div style={s.scroll}>
        <svg
          role="img"
          aria-label={t("graph.ariaLabel")}
          width={layout.width}
          height={layout.height}
          style={s.svg}
        >
          {layout.edges.map((e) => (
            <path
              key={e.id}
              d={e.d}
              fill="none"
              stroke={e.dashed ? "var(--border)" : "var(--border-strong)"}
              strokeWidth={1.5}
              strokeDasharray={e.dashed ? "4 3" : undefined}
            />
          ))}
          {layout.nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x - n.w / 2},${n.y - NODE_H / 2})`}>
              <title>{n.title}</title>
              <rect
                width={n.w}
                height={NODE_H}
                rx={6}
                fill="var(--bg-elevated)"
                stroke={n.column === "caller" || n.more ? "var(--border-strong)" : "var(--accent)"}
                strokeWidth={1.25}
              />
              <text x={n.w / 2} y={17} textAnchor="middle" style={svgText}>
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div style={s.legend}>
        <span>● {t("graph.legend.symbol")}</span>
        <span>● {t("graph.legend.callers")}</span>
        <span>● {t("graph.legend.endpoints")}</span>
      </div>
    </div>
  );
}
