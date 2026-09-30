/* SkillIconTile — the rounded Sparkles tile tinted by skill type. Used by the
   skill cards and the skill detail header. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "@/components/skill-type-badge";
import { s } from "./styles";

export function SkillIconTile({ type, size = 26 }: { type: SkillType; size?: number }) {
  const { c, bg } = SKILL_TYPE_COLOR[type];
  return (
    <div style={s.tile(size, c, bg)} aria-hidden>
      <Icon.Sparkles size={Math.round(size * 0.55)} />
    </div>
  );
}
