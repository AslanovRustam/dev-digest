/* ReviewFocus — "read these first": `file:line — reason` rows in the model's order. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { BriefFocusItem } from "@devdigest/shared";
import { s } from "../../styles";

export function ReviewFocus({
  items,
  onOpenInDiff,
}: {
  items: BriefFocusItem[];
  onOpenInDiff: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  return (
    <section style={s.section} aria-label={t("reviewFocus")}>
      <div style={s.sectionHead}>
        <Icon.ListChecks size={14} />
        {t("reviewFocus")}
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <div style={s.muted}>{t("noFocus")}</div>
      ) : (
        <ol style={s.list}>
          {items.map((item, i) => {
            const target = `${item.file}:${item.line}`;
            return (
              <li key={`${i}-${target}`} style={s.focusRow}>
                <button
                  type="button"
                  style={{ ...s.refButton, ...s.focusRef }}
                  title={target}
                  aria-label={t("openInDiff", { target })}
                  onClick={() => onOpenInDiff(item.file, item.line)}
                >
                  {target}
                </button>
                <span style={s.focusReason}>{t("focusReason", { reason: item.reason })}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
