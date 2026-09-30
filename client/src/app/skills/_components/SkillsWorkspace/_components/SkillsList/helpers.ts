import type { Skill } from "@devdigest/shared";

/** Case-insensitive search over a skill's name + description. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name}\n${sk.description}`.toLowerCase().includes(q));
}

/** Detail URL for a skill, keeping the current tab when there is one. */
export function skillHref(id: string, tab?: string): string {
  return tab ? `/skills/${id}?tab=${encodeURIComponent(tab)}` : `/skills/${id}`;
}
