/* AgentsPanel — agents that link the skill, with an "off" tag when the link or
   the agent is disabled, and an Open link to the agent's Skills tab. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { SkillStats } from "@devdigest/shared";
import { panel } from "../../panelStyles";
import { s } from "./styles";

export function AgentsPanel({ agents }: { agents: SkillStats["agents"] }) {
  const t = useTranslations("skills");
  return (
    <div style={panel.box}>
      <div style={panel.label}>{t("stats.agentsTitle")}</div>
      {agents.length === 0 ? (
        <div style={panel.empty}>{t("stats.agentsEmpty")}</div>
      ) : (
        <ul style={s.list}>
          {agents.map((a) => {
            const on = a.link_enabled && a.agent_enabled;
            return (
              <li key={a.id} style={s.row}>
                <span style={s.icon(on)}>
                  <Icon.Cpu size={13} />
                </span>
                <span style={s.name(on)}>{a.name}</span>
                {!on && (
                  <Badge color="var(--text-muted)" style={s.off}>
                    {t("stats.off")}
                  </Badge>
                )}
                <Link href={`/agents/${a.id}?tab=skills`} style={s.open}>
                  {t("stats.open")}
                  <Icon.ArrowRight size={12} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
