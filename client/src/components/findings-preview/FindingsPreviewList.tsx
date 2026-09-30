/* FindingsPreviewList — the short, read-only finding list shown in a HoverCard
   (PR list FINDINGS cell, run timeline): severity, title, category, file:line,
   confidence and a two-line plain-text excerpt of the rationale. The full card
   with markdown, suggested fix and actions lives in the Review runs section. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SEV,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  type Category,
  type Severity,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { lineLabel, plainExcerpt } from "@/lib/findings";
import { s } from "./styles";

export function FindingsPreviewList({
  findings,
  loading,
  repoFullName,
  headSha,
}: {
  /** Already filtered + ordered by the caller (see `sortForPreview`). */
  findings: FindingRecord[];
  loading?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  if (loading) return <div style={s.state}>{t("findingsPreview.loading")}</div>;
  if (findings.length === 0) return <div style={s.state}>{t("findingsPreview.empty")}</div>;
  return (
    <div data-testid="findings-preview">
      <div style={s.header}>
        <Icon.Info size={13} />
        {t("findingsPreview.header", { count: findings.length })}
      </div>
      <ul style={s.list}>
        {findings.map((f) => (
          <PreviewItem key={f.id} f={f} repoFullName={repoFullName} headSha={headSha} />
        ))}
      </ul>
    </div>
  );
}

function PreviewItem({
  f,
  repoFullName,
  headSha,
}: {
  f: FindingRecord;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const sev = SEV[f.severity as Severity] ?? SEV.INFO;
  const SevIcon = Icon[sev.icon];
  const href =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  return (
    <li style={s.item}>
      <div style={s.titleRow}>
        <span role="img" aria-label={sev.label} style={s.sevIcon(sev.c, sev.bg)}>
          <SevIcon size={12} />
        </span>
        <span style={s.title}>{f.title}</span>
        <CategoryTag category={f.category as Category} />
      </div>
      <div style={s.metaRow}>
        <MonoLink href={href}>
          {f.file}:{lineLabel(f)}
        </MonoLink>
        <ConfidenceNum value={f.confidence} />
      </div>
      <p style={s.excerpt}>{plainExcerpt(f.rationale)}</p>
    </li>
  );
}

export default FindingsPreviewList;
