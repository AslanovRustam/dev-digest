/* PrBriefCard — the PR Brief header card: verdict, summary, provenance, staleness, gaps, errors.
   GET never calls a model; Generate / Regenerate is an explicit user action.
   Risk areas and Review focus are separate blocks (the Overview places them). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, CircularScore, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBriefResponse, ReviewRecord } from "@devdigest/shared";
import { VERDICT_META } from "../VerdictBanner/constants";
import { shortSha } from "../IntentCard/helpers";
import { briefErrorKey, briefLoadErrorKey, missingInputs, reviewCounts, staleMessages } from "./helpers";
import { s } from "./styles";

export interface PrBriefCardProps {
  /** The brief query: `data` is the stored brief (or `brief: null`). */
  brief: { data: PrBriefResponse | undefined; isLoading: boolean; error: Error | null; refetch: () => void };
  /** The generate mutation. */
  generate: { isPending: boolean; error: Error | null; mutate: () => void };
  /** Newest review carrying a verdict, if any. */
  review: ReviewRecord | null;
}

function BriefError({ error, onRetry, loading }: { error: Error; onRetry: () => void; loading?: boolean }) {
  const t = useTranslations("brief");
  const { key, provider } = loading ? { ...briefLoadErrorKey(error), provider: undefined } : briefErrorKey(error);
  const retryable = key === "errors.generic" || key === "errors.unreachable" || key === "errors.load";
  return (
    <div role="alert" style={{ ...s.errorRow, ...s.error }}>
      <span>{t(key, { message: error.message, provider: provider ?? "" })}</span>
      {key === "errors.config" && (
        <Link href="/settings/api-keys" style={s.link}>
          {t("openSettings")}
        </Link>
      )}
      {retryable && (
        <Button type="button" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

function BriefSkeleton({ label }: { label: string }) {
  return (
    <div style={s.skeleton} role="status" aria-label={label}>
      <Skeleton width="40%" height={16} />
      <Skeleton height={12} />
      <Skeleton width="85%" height={12} />
      <Skeleton width="60%" height={12} />
    </div>
  );
}

export function PrBriefCard({ brief: query, generate, review }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const data = query.data;
  const brief = data?.brief ?? null;
  const busy = query.isLoading || generate.isPending;
  const loadError = !data ? query.error : null;

  const generateButton = (label: string, kind?: "primary") => (
    <Button
      type="button"
      size={kind ? undefined : "sm"}
      kind={kind}
      icon={kind ? undefined : "RefreshCw"}
      disabled={busy}
      loading={generate.isPending}
      onClick={() => generate.mutate()}
    >
      {label}
    </Button>
  );

  let body: React.ReactNode;
  if (busy) {
    body = (
      <>
        <div style={s.header}>
          <span style={s.spacer} />
          {generateButton(t(brief ? "regenerate" : "generate"))}
        </div>
        <BriefSkeleton label={t(generate.isPending ? "generating" : "loading")} />
      </>
    );
  } else if (loadError) {
    body = <BriefError error={loadError} onRetry={query.refetch} loading />;
  } else if (!data || !brief) {
    body = (
      <div style={s.empty}>
        <strong>{t("empty.title")}</strong>
        <span style={s.muted}>{t("empty.body")}</span>
        {generateButton(t("generate"), "primary")}
      </div>
    );
  } else {
    const vm = review?.verdict ? (VERDICT_META[review.verdict] ?? VERDICT_META.comment) : null;
    const VIcon = vm ? Icon[vm.icon] : null;
    const counts = review ? reviewCounts(review) : null;
    const stale = staleMessages(data);
    const missing = missingInputs(brief);
    body = (
      <>
        <div style={s.header}>
          {stale.length > 0 && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("stale")}
            </Badge>
          )}
          {stale.map((m) => (
            <span key={m.key} style={s.muted}>
              {t(m.key, m.values)}
            </span>
          ))}
          <span style={s.spacer} />
          {generateButton(t("regenerate"))}
        </div>
        {vm && VIcon && review && counts && (
          <div style={s.verdictRow}>
            <div style={s.verdictIcon(vm.bg, vm.c)}>
              <VIcon size={20} />
            </div>
            <div style={s.verdictMain}>
              <div style={s.verdictTitle}>
                <span style={s.verdictLabel(vm.c)}>{t(`verdict.${vm.labelKey}`)}</span>
                <Badge color="var(--text-secondary)">
                  {t("findingsCount", { count: counts.findings })}
                  {t("blockersCount", { count: counts.blockers })}
                </Badge>
              </div>
            </div>
            {review.score != null && (
              <div style={s.scoreCol}>
                <CircularScore score={review.score} size={48} stroke={5} />
                <span style={s.scoreLabel}>{t("prScore")}</span>
              </div>
            )}
          </div>
        )}
        <p style={s.summary}>{brief.summary}</p>
        <div style={s.meta}>
          {t("provenance", {
            sha: shortSha(brief.head_sha),
            model: brief.model,
            cost:
              brief.cost_usd == null ? t("costUnknown") : t("costKnown", { amount: brief.cost_usd.toFixed(3) }),
            tokensIn: brief.tokens_in,
            tokensOut: brief.tokens_out,
          })}
        </div>
        {missing.length > 0 && (
          <ul style={s.missingList}>
            {missing.map((m) => (
              <li key={`${m.source}-${m.ref ?? ""}`} style={s.muted}>
                {t("generatedWithout", {
                  input: m.ref ? `${t(`inputs.${m.source}`)} ${m.ref}` : t(`inputs.${m.source}`),
                  reason: t(`reasons.${m.reason}`),
                })}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <section style={s.wrap} aria-label={t("title")}>
      <SectionLabel icon="FileText">{t("title")}</SectionLabel>
      {body}
      {generate.error && !busy && <BriefError error={generate.error} onRetry={() => generate.mutate()} />}
    </section>
  );
}
