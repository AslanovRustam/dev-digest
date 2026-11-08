/* RiskAreas — the brief's risks: title, severity (icon colour + text), file refs, expandable explanation.
   Model text is rendered as React text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { SEVERITY_META } from "../../constants";
import { parseFileRef } from "../../helpers";
import { s } from "../../styles";

function RiskItem({
  risk,
  onOpenInDiff,
}: {
  risk: Risk;
  onOpenInDiff: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const meta = SEVERITY_META[risk.severity];
  const SevIcon = Icon[meta.icon];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <li style={s.risk}>
      <div style={s.riskHead}>
        <SevIcon size={14} style={{ color: meta.color, marginTop: 2 }} aria-hidden />
        <span style={s.riskTitle}>{risk.title}</span>
        <span style={s.severityText(meta.color)}>{t(`severity.${risk.severity}`)}</span>
        <button
          type="button"
          style={s.expandButton}
          aria-expanded={open}
          aria-label={t(open ? "collapseRisk" : "expandRisk", { title: risk.title })}
          onClick={() => setOpen((v) => !v)}
        >
          <Chevron size={14} />
        </button>
      </div>
      {risk.file_refs.length > 0 && (
        <div style={s.refs}>
          {risk.file_refs.map((ref) => (
            <button
              key={ref}
              type="button"
              style={s.refButton}
              aria-label={t("openInDiff", { target: ref })}
              onClick={() => {
                const p = parseFileRef(ref);
                onOpenInDiff(p.path, p.start);
              }}
            >
              {ref}
            </button>
          ))}
        </div>
      )}
      {open && <p style={s.explanation}>{risk.explanation}</p>}
    </li>
  );
}

export function RiskAreas({
  risks,
  onOpenInDiff,
}: {
  risks: Risk[];
  onOpenInDiff: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  return (
    <section style={s.section} aria-label={t("riskAreas")}>
      <div style={s.sectionHead}>
        <Icon.AlertTriangle size={14} />
        {t("riskAreas")}
      </div>
      {risks.length === 0 ? (
        <div style={s.muted}>{t("noRisks")}</div>
      ) : (
        <ul style={s.list}>
          {risks.map((r, i) => (
            <RiskItem key={`${i}-${r.title}`} risk={r} onOpenInDiff={onOpenInDiff} />
          ))}
        </ul>
      )}
    </section>
  );
}
