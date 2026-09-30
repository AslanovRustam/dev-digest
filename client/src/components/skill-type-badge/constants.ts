import type { SkillType } from "@devdigest/shared";

/** Colour pair per skill type — shared by the Skills page and the agent Skills tab. */
export const SKILL_TYPE_COLOR: Record<SkillType, { c: string; bg: string }> = {
  rubric: { c: "var(--accent-text)", bg: "var(--accent-bg)" },
  convention: { c: "var(--ok)", bg: "var(--ok-bg)" },
  security: { c: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { c: "var(--text-secondary)", bg: "var(--info-bg)" },
};

/**
 * Every skill type, in display order. Client code must import `@devdigest/shared`
 * TYPE-only: a value import (e.g. `SkillType.options`) passes tsc and vitest but
 * breaks `next build`, which cannot resolve the vendored copy's `.js` specifiers.
 */
export const SKILL_TYPES = Object.keys(SKILL_TYPE_COLOR) as SkillType[];
