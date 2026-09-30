import type { IconName } from "@devdigest/ui";

/** Detail tabs, in display order. No Evals tab until L06. */
export const SKILL_TABS = ["config", "preview", "stats", "versions"] as const;
export type SkillTab = (typeof SKILL_TABS)[number];

/** Tab icons (labels are i18n'd under skills.detail.tabs). */
export const TAB_ICON: Record<SkillTab, IconName> = {
  config: "Settings",
  preview: "Eye",
  stats: "BarChart",
  versions: "History",
};
