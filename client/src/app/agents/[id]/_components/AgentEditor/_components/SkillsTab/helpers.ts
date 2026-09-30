import type { AgentSkillLink, AgentSkillsSet, Skill } from "@devdigest/shared";

/** One row of the Skills tab: a workspace skill plus this agent's link state. */
export interface SkillRowModel {
  skill: Skill;
  /** The agent links this skill (it has a position in the agent's order). */
  linked: boolean;
  /** The per-agent checkbox (`agent_skills.enabled`); always false when unlinked. */
  enabled: boolean;
}

/**
 * All workspace skills as rows: linked ones first in the agent's `order`, then
 * the unlinked ones by name. Links whose skill no longer exists are dropped.
 */
export function mergeRows(skills: readonly Skill[], links: readonly AgentSkillLink[]): SkillRowModel[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linkedIds = new Set<string>();
  const linked: SkillRowModel[] = [];
  for (const link of [...links].sort((a, b) => a.order - b.order)) {
    const skill = byId.get(link.skill_id);
    if (!skill || linkedIds.has(skill.id)) continue;
    linkedIds.add(skill.id);
    linked.push({ skill, linked: true, enabled: link.enabled });
  }
  const unlinked = skills
    .filter((sk) => !linkedIds.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, linked: false, enabled: false }));
  return [...linked, ...unlinked];
}

/** Move one element of a list to another index (returns a new list). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** The PUT body: every linked row, in display order (order = array index). */
export function toItems(rows: readonly SkillRowModel[]): AgentSkillsSet["items"] {
  return rows.filter((r) => r.linked).map((r) => ({ skill_id: r.skill.id, enabled: r.enabled }));
}

/** Number of linked rows (they are always the leading block of `rows`). */
export function linkedCount(rows: readonly SkillRowModel[]): number {
  return rows.filter((r) => r.linked).length;
}

/**
 * Flip one row's checkbox. A linked row keeps its position (only `enabled`
 * changes); an unlinked row becomes linked + enabled, appended after the
 * currently linked rows.
 */
export function toggleRow(rows: readonly SkillRowModel[], skillId: string): SkillRowModel[] {
  const index = rows.findIndex((r) => r.skill.id === skillId);
  const row = rows[index];
  if (!row) return [...rows];
  if (row.linked) return rows.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r));
  const rest = rows.filter((_, i) => i !== index);
  const at = linkedCount(rest);
  return [...rest.slice(0, at), { ...row, linked: true, enabled: true }, ...rest.slice(at)];
}

/** Case-insensitive match on name or description; empty query keeps every row. */
export function filterRows(rows: readonly SkillRowModel[], query: string): SkillRowModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (r) => r.skill.name.toLowerCase().includes(q) || r.skill.description.toLowerCase().includes(q),
  );
}
