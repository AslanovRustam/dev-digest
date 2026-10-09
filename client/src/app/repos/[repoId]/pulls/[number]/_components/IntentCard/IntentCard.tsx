/* IntentCard — the PR's derived purpose: summary, scope, risk areas, sources.
   GET never calls a model; Derive / Re-derive is an explicit user action. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks/intent";
import { IntentSources } from "./_components/IntentSources";
import { confidenceTone, intentErrorKey, riskIcon, shortSha } from "./helpers";
import { s } from "./styles";

function ScopeList({
  label,
  items,
  none,
  tone,
}: {
  label: string;
  items: string[];
  none: string;
  tone: "in" | "out";
}) {
  const ScopeIcon = tone === "in" ? Icon.Check : Icon.X;
  return (
    <div>
      <div style={tone === "in" ? s.scopeLabelIn : s.scopeLabelOut}>
        <ScopeIcon size={13} />
        {label}
      </div>
      {items.length === 0 ? (
        <div style={s.muted}>{none}</div>
      ) : (
        <ul style={s.list}>
          {items.map((i) => (
            <li key={i} style={tone === "in" ? s.itemIn : s.itemOut}>
              <span style={tone === "in" ? s.dotIn : s.dotOut} aria-hidden />
              {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IntentCard({ prId }: { prId: string }) {
  const t = useTranslations("intent");
  const { data, isLoading, isError } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  const err = derive.error;
  const errorText = err ? t(intentErrorKey(err), { message: err.message }) : null;

  if (isLoading) return <div style={{ ...s.wrap, ...s.muted }}>{t("loading")}</div>;
  if (isError || !data) {
    return (
      <div role="alert" style={{ ...s.wrap, ...s.error }}>
        {t("errors.load")}
      </div>
    );
  }

  const intent = data.intent;
  if (!intent) {
    return (
      <div style={s.wrap}>
        <div style={s.header}>
          <Icon.Target size={16} />
          <span style={s.title}>{t("title")}</span>
        </div>
        <div style={s.empty}>
          <strong>{t("empty.title")}</strong>
          <span style={s.muted}>{t("empty.body")}</span>
          <Button type="button" kind="primary" loading={derive.isPending} onClick={() => derive.mutate()}>
            {t("derive")}
          </Button>
          {errorText && (
            <span role="alert" style={s.error}>
              {errorText}
            </span>
          )}
        </div>
      </div>
    );
  }

  const tone = confidenceTone(intent.confidence);
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Target size={16} />
        <span style={s.title}>{t("title")}</span>
        <Badge color={tone.color} bg={tone.bg}>
          {t(`confidence.${intent.confidence}`)}
        </Badge>
        <span style={s.meta}>{t("derivedFrom", { sha: shortSha(intent.head_sha), model: intent.model })}</span>
        {data.stale && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("stale")}
          </Badge>
        )}
        <span style={s.spacer} />
        <Button type="button" size="sm" icon="RefreshCw" loading={derive.isPending} onClick={() => derive.mutate()}>
          {t("rederive")}
        </Button>
      </div>
      {errorText && (
        <div role="alert" style={s.error}>
          {errorText}
        </div>
      )}

      <div>
        <div style={s.label}>{t("summaryLabel")}</div>
        <blockquote style={s.summary}>{intent.intent}</blockquote>
      </div>

      <div style={s.columns}>
        <ScopeList label={t("inScope")} items={intent.in_scope} none={t("none")} tone="in" />
        <ScopeList label={t("outOfScope")} items={intent.out_of_scope} none={t("none")} tone="out" />
      </div>

      {intent.risk_areas.length > 0 && (
        <div>
          <div style={s.label}>{t("riskAreas")}</div>
          <div style={s.chips}>
            {intent.risk_areas.map((r) => (
              <Badge key={`${r.kind}-${r.label}`} icon={riskIcon(r.kind)} color="var(--warn)" bg="var(--warn-bg)">
                {r.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={s.label}>{t("sources")}</div>
        <IntentSources sources={intent.sources} missing={intent.missing_context} />
      </div>
    </div>
  );
}
