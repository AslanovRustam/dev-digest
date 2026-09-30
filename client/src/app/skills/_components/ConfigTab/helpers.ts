import type { Skill, SkillType, SkillUpdate } from "@devdigest/shared";

/** The editable content of a skill (what a save versions). */
export interface SkillForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/** Form baseline: the skill's content, or a blank `custom` skill for /skills/new. */
export function formFrom(skill?: Skill): SkillForm {
  if (!skill) return { name: "", description: "", type: "custom", body: "" };
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

/**
 * Only the content fields that differ from the baseline. The server trims the
 * name, so a trailing space is not a change.
 */
export function contentPatch(form: SkillForm, base: SkillForm): SkillUpdate {
  const patch: SkillUpdate = {};
  if (form.name.trim() !== base.name) patch.name = form.name.trim();
  if (form.description !== base.description) patch.description = form.description;
  if (form.type !== base.type) patch.type = form.type;
  if (form.body !== base.body) patch.body = form.body;
  return patch;
}

export function isDirty(form: SkillForm, base: SkillForm): boolean {
  return Object.keys(contentPatch(form, base)).length > 0;
}

/** Name and body are required (SkillCreate). */
export function isValid(form: SkillForm): boolean {
  return form.name.trim().length > 0 && form.body.trim().length > 0;
}
