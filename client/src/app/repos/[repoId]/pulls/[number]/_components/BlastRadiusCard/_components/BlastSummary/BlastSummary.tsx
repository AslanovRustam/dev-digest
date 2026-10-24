"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastStats } from "@devdigest/shared";
import { s } from "./styles";

const STATS = [
  { key: "symbols", Glyph: Icon.Code },
  { key: "callers", Glyph: Icon.CornerDownRight },
  { key: "endpoints", Glyph: Icon.Globe },
  { key: "crons", Glyph: Icon.Clock },
] as const;

export function BlastSummary({ stats }: { stats: BlastStats }) {
  const t = useTranslations("blast");
  return (
    <div style={s.row}>
      {STATS.map(({ key, Glyph }) => (
        <span key={key} style={s.stat}>
          <Glyph size={14} />
          <span className="tnum" style={s.num}>
            {stats[key]}
          </span>
          {t(`stat.${key}`)}
        </span>
      ))}
    </div>
  );
}
