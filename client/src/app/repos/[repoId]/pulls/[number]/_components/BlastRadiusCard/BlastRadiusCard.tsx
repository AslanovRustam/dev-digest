/* BlastRadiusCard — what a PR can break: changed symbols, their callers (file:line links),
   and the endpoints / crons behind them. Reads the precomputed index; never calls a model. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks/blast";
import { BlastGraph } from "./_components/BlastGraph";
import { BlastSummary } from "./_components/BlastSummary";
import { BlastTree } from "./_components/BlastTree";
import { BLAST_VIEWS, type BlastView } from "./constants";
import { callerHref, kindByName, linkSha } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string;
  repoFullName: string | null;
  headSha: string;
}

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError } = usePrBlast(prId);
  const [view, setView] = useState<BlastView>("tree");

  if (isLoading) return <div style={{ ...s.wrap, ...s.muted }}>{t("loading")}</div>;
  if (isError || !data) {
    return (
      <div role="alert" style={{ ...s.wrap, ...s.error }}>
        {t("errors.load")}
      </div>
    );
  }

  const sha = linkSha(data.indexed_sha, headSha);
  const kinds = kindByName(data.changed_symbols);
  const hrefFor = (file: string, line: number) => callerHref(repoFullName, sha, file, line);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Zap size={16} />
        <span style={s.title}>{t("title")}</span>
        {data.degraded && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("degraded.badge")}
          </Badge>
        )}
      </div>
      {data.degraded && data.reason && (
        <div role="status" style={s.reason}>
          {t(`degraded.reason.${data.reason}`)}
        </div>
      )}

      <div style={s.summaryRow}>
        <BlastSummary stats={data.stats} />
        <div role="group" aria-label={t("view.ariaLabel")} style={s.toggle}>
          {BLAST_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              style={{ ...s.toggleButton, ...(view === v ? s.toggleButtonActive : null) }}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {data.downstream.length === 0 ? (
        <div style={s.muted}>{t("noDownstream", { count: data.stats.symbols })}</div>
      ) : view === "tree" ? (
        <BlastTree key={prId} downstream={data.downstream} kinds={kinds} hrefFor={hrefFor} />
      ) : (
        <BlastGraph downstream={data.downstream} />
      )}
    </div>
  );
}
