import { SKILL_TABS, type SkillTab } from "./constants";

/** `?tab=` value → a known tab; anything else falls back to config. */
export function parseSkillTab(raw: string | null | undefined): SkillTab {
  return (SKILL_TABS as readonly string[]).includes(raw ?? "") ? (raw as SkillTab) : "config";
}
