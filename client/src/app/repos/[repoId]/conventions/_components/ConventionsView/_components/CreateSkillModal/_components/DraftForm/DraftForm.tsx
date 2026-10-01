/* DraftForm — the editable part of "Create skill from conventions". Mounted
   only once the server draft exists, so the form state is initialised from it
   once (no effect copying query data into state). Renders inside the modal
   chrome its parent passes as `frame`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Agent, ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { BodyEditor } from "@/components/skill-body-editor";
import { SKILL_TYPES } from "@/components/skill-type-badge";
import { s } from "./styles";

export interface DraftFormValues {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  /** "" = do not link to an agent. */
  agentId: string;
}

export type ModalFrame = (props: {
  subtitle?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) => React.ReactNode;

export function DraftForm({
  draft,
  agents,
  saving,
  error,
  onSave,
  onCancel,
  frame,
}: {
  draft: ConventionSkillDraft;
  agents: Pick<Agent, "id" | "name">[];
  saving: boolean;
  error: Error | null;
  onSave: (values: DraftFormValues) => void;
  onCancel: () => void;
  frame: ModalFrame;
}) {
  const t = useTranslations("conventions");
  const [form, setForm] = React.useState<DraftFormValues>(() => ({
    name: draft.name,
    description: draft.description,
    type: draft.type,
    enabled: true,
    body: draft.body,
    agentId: "",
  }));

  const set =
    <K extends keyof DraftFormValues>(k: K) =>
    (v: DraftFormValues[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  const canSave = form.name.trim().length > 0 && form.body.trim().length > 0;
  const agentOptions = [
    { value: "", label: t("modal.agentNone") },
    ...agents.map((a) => ({ value: a.id, label: a.name })),
  ];

  return frame({
    subtitle: <span className="mono">{form.name || " "}</span>,
    footer: (
      <>
        <Button kind="secondary" onClick={onCancel} disabled={saving}>
          {t("modal.cancel")}
        </Button>
        <Button kind="primary" icon="Sparkles" onClick={() => onSave(form)} disabled={!canSave} loading={saving}>
          {saving ? t("modal.creating") : t("modal.create")}
        </Button>
      </>
    ),
    children: (
      <>
        <FormField label={t("modal.name")} required>
          <TextInput mono value={form.name} onChange={set("name")} aria-label={t("modal.name")} maxLength={120} />
        </FormField>
        <FormField label={t("modal.description")} hint={t("modal.descriptionHint")}>
          <TextInput
            value={form.description}
            onChange={set("description")}
            aria-label={t("modal.description")}
            maxLength={1000}
          />
        </FormField>
        <div style={s.row}>
          <FormField label={t("modal.type")}>
            <SelectInput value={form.type} onChange={(v) => set("type")(v as SkillType)} options={SKILL_TYPES} />
          </FormField>
          <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
            <label style={s.toggle}>
              <Toggle on={form.enabled} onChange={set("enabled")} />
              <span style={s.srOnly}>{t("modal.enabled")}</span>
            </label>
          </FormField>
        </div>
        <FormField label={t("modal.agent")} hint={t("modal.agentHint")}>
          <SelectInput value={form.agentId} onChange={set("agentId")} options={agentOptions} mono={false} />
        </FormField>
        <FormField label={t("modal.body")} required>
          <BodyEditor fileName={`${form.name || "skill"}.md`} value={form.body} onChange={set("body")} dirty />
        </FormField>
        {error && (
          <div role="alert" style={s.error}>
            {error.message}
          </div>
        )}
      </>
    ),
  });
}

export default DraftForm;
