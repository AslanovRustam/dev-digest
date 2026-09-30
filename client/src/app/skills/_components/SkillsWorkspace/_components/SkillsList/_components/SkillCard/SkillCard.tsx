/* SkillCard — one skill in the list: type-tinted tile, mono name, global
   enable toggle, one-line description, type badge + source, and the
   "N agents · X% pull · Y% accept" footer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { SkillIconTile } from "@/app/skills/_components/SkillIconTile";
import { acceptRateColor, formatPct } from "@/app/skills/rates";
import { SOURCE_ICON } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <SkillIconTile type={skill.type} />
        <span className="mono" style={s.name} title={skill.name}>
          {skill.name}
        </span>
        {onToggle && (
          // The label names the switch for AT; stopPropagation keeps a toggle from selecting the card.
          <label style={s.toggleWrap} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <span style={s.srOnly}>{t("card.toggleLabel", { name: skill.name })}</span>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </label>
        )}
      </div>
      <div style={s.description} title={skill.description || undefined}>
        {skill.description || t("card.noDescription")}
      </div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          <SourceIcon size={12} />
          {t(`card.source.${skill.source}`)}
        </span>
      </div>
      <div style={s.divider} />
      <div style={s.footer}>
        <span>{t("card.agents", { count: skill.agent_count ?? 0 })}</span>
        <span>{t("card.pull", { value: formatPct(skill.pull_rate) })}</span>
        <span>
          {t.rich("card.accept", {
            value: formatPct(skill.accept_rate),
            v: (chunks) => <span style={s.acceptValue(acceptRateColor(skill.accept_rate))}>{chunks}</span>,
          })}
        </span>
      </div>
    </div>
  );
}
