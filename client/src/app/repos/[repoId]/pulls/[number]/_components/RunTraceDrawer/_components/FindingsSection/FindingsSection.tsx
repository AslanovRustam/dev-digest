/* FindingsSection — the persisted findings of THIS run, rendered inside a
   collapsible TraceSection with the same pieces as the "Review runs" list:
   per-severity counts in the header, click-to-filter severity counters, and
   full FindingCards (markdown, suggested fix, accept/dismiss). The filter is
   local to the drawer — it does not touch the page's ?severity. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { SeverityTally } from "@/components/severity-tally";
import { countBySeverity } from "@/lib/findings";
import { useFindingAction } from "@/lib/hooks/reviews";
import { FindingCard } from "../../../FindingCard";
import { SeverityFilterBar } from "../../../SeverityFilterBar";
import { visibleFindings } from "../../../FindingsPanel/helpers";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection";

export function FindingsSection({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  /** Wires accept/dismiss; without it the cards are read-only. */
  prId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("runs");
  const action = useFindingAction();
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const shown = React.useMemo(() => visibleFindings(findings, { severity }), [findings, severity]);

  return (
    <TraceSection
      icon="AlertOctagon"
      title={t("trace.findings")}
      right={
        <span style={s.findingsHeaderRight}>
          {findings.length > 0 && <SeverityTally counts={counts} />}
          <Badge color="var(--text-muted)">{findings.length}</Badge>
        </span>
      }
    >
      {findings.length === 0 ? (
        <span style={s.noToolCalls}>{t("trace.noFindings")}</span>
      ) : (
        <>
          <SeverityFilterBar counts={counts} value={severity} onChange={setSeverity} />
          <div style={s.findingsList}>
            {shown.map((f, i) => (
              <FindingCard
                key={f.id}
                f={f}
                defaultExpanded={i === 0}
                pending={action.isPending}
                repoFullName={repoFullName}
                headSha={headSha}
                onAction={
                  prId ? (act) => action.mutate({ findingId: f.id, action: act, prId }) : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </TraceSection>
  );
}
