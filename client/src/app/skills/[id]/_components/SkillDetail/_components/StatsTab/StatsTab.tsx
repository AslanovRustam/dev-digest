/* StatsTab — 30-day correlational stats for one skill: four tiles (used by,
   pull frequency, accept rate + ring, findings), the agents that link it, and
   findings by category. Correlated, not causal — the caption says so. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks";
import { acceptRateColor, formatPct } from "@/app/skills/rates";
import { AcceptRing } from "./_components/AcceptRing";
import { AgentsPanel } from "./_components/AgentsPanel";
import { CategoryDonut } from "./_components/CategoryDonut";
import { StatTile } from "./_components/StatTile";
import { s } from "./styles";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) {
    return (
      <div style={s.tiles}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={92} />
        ))}
      </div>
    );
  }
  if (isError || !stats) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <StatTile label={t("stats.usedBy")} value={t("stats.usedByValue", { count: stats.used_by })} />
        <StatTile label={t("stats.pullFrequency")} value={formatPct(stats.pull_rate)} />
        <StatTile
          label={t("stats.acceptRate")}
          value={formatPct(stats.accept_rate)}
          valueColor={acceptRateColor(stats.accept_rate)}
          aside={<AcceptRing rate={stats.accept_rate} />}
        />
        <StatTile label={t("stats.findings", { days: stats.window_days })} value={String(stats.findings)} />
      </div>
      <div style={s.panels}>
        <AgentsPanel agents={stats.agents} />
        <CategoryDonut byCategory={stats.by_category} windowDays={stats.window_days} />
      </div>
      <p style={s.caption}>{t("stats.caption")}</p>
    </div>
  );
}
