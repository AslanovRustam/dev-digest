"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore, type IconName } from "@devdigest/ui";
import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { HoverCard } from "@/components/hover-card";
import { SeverityTally } from "@/components/severity-tally";
import { FindingsPreviewList } from "@/components/findings-preview";
import { countBySeverity, sortForPreview } from "@/lib/findings";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 *
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected" (red), never a green "done". Outcome
 * is derived from the denormalized blocker/finding counts on the run row, so it
 * matches the CI gate (deterministic) rather than the model's verdict.
 */

type Outcome = { key: string; color: string; bg: string; icon: IconName };

function outcomeOf(run: RunSummary): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed")
    return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  // Settled ("done"): color by the deterministic outcome.
  if ((run.blockers ?? 0) > 0)
    return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  textAlign: "left",
};

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
};

// Commits are markers, not actions — lighter (dashed, transparent) so they read
// as separators between the runs they sit chronologically between.
const commitRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px dashed var(--border)",
  background: "transparent",
};

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/**
 * A settled run's findings line: per-severity counts that preview the findings
 * on hover and jump to the run's accordion on click. Falls back to the plain
 * "N finding(s)" text when the run's review isn't loaded (or all are dismissed).
 */
function RunFindings({
  run,
  findings,
  repoFullName,
  headSha,
  onGoToReview,
}: {
  run: RunSummary;
  findings?: FindingRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
  onGoToReview?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const blockers = (run.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: run.blockers ?? 0 }) : "";
  if (!findings || findings.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {t("runStatus.findings", { count: run.findings_count ?? 0 })}
        {blockers}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
      <HoverCard
        trigger={<SeverityTally counts={countBySeverity(findings)} />}
        onTriggerClick={onGoToReview ? () => onGoToReview(run.run_id) : undefined}
      >
        <FindingsPreviewList findings={sortForPreview(findings)} repoFullName={repoFullName} headSha={headSha} />
      </HoverCard>
      {blockers}
    </div>
  );
}

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export function RunHistory({
  runs,
  commits = [],
  onOpenTrace,
  onGoToReview,
  onDelete,
  findingsByRun,
  repoFullName,
  headSha,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** run_id → that run's open findings, for the hover preview. */
  findingsByRun?: Map<string, FindingRecord[]>;
  /** owner/repo + head sha — deep-links the preview's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        if (item.kind === "commit") {
          const c = item.commit;
          return (
            <div key={`commit:${c.sha}`} style={commitRowStyle}>
              <Icon.GitCommit size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
                {c.sha.slice(0, 7)}
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={c.message}
              >
                {c.message.split("\n")[0]}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{c.author}</span>
              {c.committed_at && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                  {new Date(c.committed_at).toLocaleTimeString()}
                </span>
              )}
            </div>
          );
        }

        const r = item.run;
        const o = outcomeOf(r);
        const settled = r.status === "done";
        return (
          <div key={`run:${r.run_id}`} style={rowStyle}>
            <Badge color={o.color} bg={o.bg} icon={o.icon}>
              {t(`runStatus.${o.key}`)}
            </Badge>
            {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                <button
                  type="button"
                  onClick={() => onGoToReview?.(r.run_id)}
                  title={t("timeline.goToReview")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    cursor: onGoToReview ? "pointer" : "default",
                    textDecoration: onGoToReview ? "underline" : "none",
                    textDecorationStyle: "dotted",
                    textUnderlineOffset: 3,
                  }}
                >
                  {r.agent_name ?? "Agent"}
                </button>{" "}
                <span className="mono" style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
                  {r.provider}/{r.model}
                </span>
              </div>
              {r.status === "failed" && r.error && (
                <div
                  style={{ fontSize: 12, color: "var(--crit)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={r.error}
                >
                  {r.error}
                </div>
              )}
              {settled && (
                <RunFindings
                  run={r}
                  findings={findingsByRun?.get(r.run_id)}
                  repoFullName={repoFullName}
                  headSha={headSha}
                  onGoToReview={onGoToReview}
                />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              {/* Only settled runs have a price; failed/running ones show none. */}
              {settled && (
                <RunCostBadge variant="full" costUsd={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} />
              )}
            </div>
            <button
              type="button"
              title={t("timeline.openTrace")}
              aria-label={t("timeline.openTrace")}
              onClick={() => onOpenTrace(r.run_id)}
              style={iconBtnStyle}
            >
              <Icon.FileText size={13} />
            </button>
            {onDelete && r.status !== "running" && (
              <span
                role="button"
                aria-label={t("timeline.deleteRun")}
                title={t("timeline.deleteRun")}
                onClick={() => onDelete(r.run_id)}
                style={{ display: "inline-flex", padding: 3, borderRadius: 5, color: "var(--text-muted)", flexShrink: 0, cursor: "pointer" }}
              >
                <Icon.Trash size={13} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
