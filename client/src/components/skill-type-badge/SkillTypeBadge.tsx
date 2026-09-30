/* SkillTypeBadge — the type chip (rubric / convention / security / custom) used
   on skill cards, the skill detail header and the agent Skills tab. The label is
   the type itself, so the colour is never the only signal. */
"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const { c, bg } = SKILL_TYPE_COLOR[type];
  return (
    <Badge color={c} bg={bg} mono style={{ fontSize: 11, padding: "1px 7px" }}>
      {type}
    </Badge>
  );
}

export default SkillTypeBadge;
