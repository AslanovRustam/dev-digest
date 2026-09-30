/* SkillDetail — right pane of /skills/[id]: header (type tile, mono name, type
   badge, vN) and the Config · Preview · Stats · Versions tabs. Loads the skill
   itself so the page stays a thin route entry. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, Tabs } from "@devdigest/ui";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { useSkill } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { SkillIconTile } from "../../../_components/SkillIconTile";
import { VersionBadge } from "../../../_components/VersionBadge";
import { ConfigTab } from "../../../_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { SKILL_TABS, TAB_ICON, type SkillTab } from "./constants";
import { s } from "./styles";

export function SkillDetail({ id, tab, onTab }: { id: string; tab: SkillTab; onTab: (t: SkillTab) => void }) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={26} width={260} />
        <Skeleton height={36} />
        <Skeleton height={280} />
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return <EmptyState icon="Sparkles" title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />;
  }
  if (isError || !skill) {
    return (
      <ErrorState
        body={error instanceof ApiError ? error.message : t("detail.loadError")}
        onRetry={() => refetch()}
      />
    );
  }

  const tabs = SKILL_TABS.map((k) => ({ key: k, label: t(`detail.tabs.${k}`), icon: TAB_ICON[k] }));

  return (
    <>
      <div style={s.header}>
        <SkillIconTile type={skill.type} size={30} />
        <h2 className="mono" style={s.name}>
          {skill.name}
        </h2>
        <SkillTypeBadge type={skill.type} />
        <VersionBadge version={skill.version} />
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(k as SkillTab)} pad="0 28px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab key={skill.id} skill={skill} />}
        {tab === "preview" && <PreviewTab body={skill.body} />}
        {tab === "stats" && <StatsTab skillId={skill.id} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </>
  );
}
