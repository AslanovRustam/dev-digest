/* SeverityFilterBar — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" above the Review
   runs accordions (and in the run trace drawer). Clicking a level shows only
   its findings; clicking the active level clears the filter. On the page it
   also hosts the "Hide low confidence" toggle, since the counts depend on it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, Toggle } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITIES, type SeverityTallyCounts } from "../../../../../../../lib/findings";
import { s } from "./styles";

export function SeverityFilterBar({
  counts,
  value,
  onChange,
  hideLow,
  onHideLowChange,
}: {
  counts: SeverityTallyCounts;
  value: Severity | null;
  onChange: (severity: Severity | null) => void;
  /** Omit both to render the counters without the confidence toggle. */
  hideLow?: boolean;
  onHideLowChange?: (hideLow: boolean) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div style={s.bar}>
      <div role="group" aria-label={t("severityFilter.ariaLabel")} style={s.levels}>
        {SEVERITIES.map((sev, i) => {
          const meta = SEV[sev];
          const I = Icon[meta.icon];
          const active = value === sev;
          const count = counts[sev];
          const label = meta.label.toUpperCase();
          const disabled = count === 0 && !active;
          return (
            <React.Fragment key={sev}>
              {i > 0 && (
                <span aria-hidden style={s.sep}>
                  ·
                </span>
              )}
              <button
                type="button"
                aria-pressed={active}
                // An empty level has nothing to show — unless it is the active one,
                // which must stay clickable to clear the filter.
                disabled={disabled}
                title={active ? t("severityFilter.clear") : t("severityFilter.showOnly", { severity: meta.label.toLowerCase() })}
                onClick={() => onChange(active ? null : sev)}
                style={s.level(meta.c, meta.bg, active, count === 0 || (value !== null && !active), disabled)}
              >
                <I size={13} />
                <span className="tnum">{t("severityFilter.level", { count, severity: label })}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
      {onHideLowChange && (
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={!!hideLow} onChange={onHideLowChange} size={16} />
        </div>
      )}
    </div>
  );
}
