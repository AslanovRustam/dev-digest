"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

/** Findings indicator of a role group: a severity-coloured dot + number of files with open findings. */
export function GroupBadge({ count, color }: { count: number; color: string }) {
  const t = useTranslations("prReview");
  return (
    <span role="img" aria-label={t("smartDiff.filesWithFindings", { count })} style={s.badge}>
      <span style={{ ...s.dot, background: color }} />
      {count}
    </span>
  );
}
