/* VersionBadge — "⟜ vN" chip (GitCommit icon + version). Used by the skill
   detail header and the Config tab heading. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";

export function VersionBadge({ version }: { version: number }) {
  const t = useTranslations("skills");
  return (
    <Badge icon="GitCommit" mono color="var(--text-secondary)" style={{ fontSize: 11, padding: "1px 7px" }}>
      {t("detail.version", { version })}
    </Badge>
  );
}
