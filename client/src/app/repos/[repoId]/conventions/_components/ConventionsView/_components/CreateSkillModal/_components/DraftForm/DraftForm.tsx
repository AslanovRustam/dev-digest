/* DraftForm — the editable part of "Create skill from conventions". Mounted
   only once the server draft exists, so the form state is initialised from it
   once (no effect copying query data into state). It is a real <form>: the
   modal's footer button submits it through `form={id}`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
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

export function DraftForm({
  id,
  draft,
  agents,
  error,
  onSubmit,
}: {
  /** The form id the modal's submit button points at. */
  id: string;
  draft: ConventionSkillDraft;
  agents: Pick<Agent, "id" | "name">[];
  error: Error | null;
  onSubmit: (values: DraftFormValues) => void;
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
  const [invalid, setInvalid] = React.useState(false);

  const set =
    <K extends keyof DraftFormValues>(k: K) =>
    (v: DraftFormValues[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSubmit(form);
  };

  const agentOptions = [
    { value: "", label: t("modal.agentNone") },
    ...agents.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <form id={id} onSubmit={submit} noValidate>
      <FormField label={t("modal.name")} required>
        <TextInput
          mono
          value={form.name}
          onChange={set("name")}
          aria-label={t("modal.name")}
          maxLength={120}
          autoFocus
        />
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
          {/* SelectInput takes no aria-label; the wrapping label names it. */}
          <label style={s.labelled}>
            <span style={s.srOnly}>{t("modal.type")}</span>
            <SelectInput value={form.type} onChange={(v) => set("type")(v as SkillType)} options={SKILL_TYPES} />
          </label>
        </FormField>
        <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
          <label style={s.toggle}>
            <Toggle on={form.enabled} onChange={set("enabled")} />
            <span style={s.srOnly}>{t("modal.enabled")}</span>
          </label>
        </FormField>
      </div>
      <FormField label={t("modal.agent")} hint={t("modal.agentHint")}>
        <label style={s.labelled}>
          <span style={s.srOnly}>{t("modal.agent")}</span>
          <SelectInput value={form.agentId} onChange={set("agentId")} options={agentOptions} mono={false} />
        </label>
      </FormField>
      <FormField label={t("modal.body")} required>
        <BodyEditor fileName={`${form.name || "skill"}.md`} value={form.body} onChange={set("body")} dirty />
      </FormField>
      {(invalid || error) && (
        <div role="alert" style={s.error}>
          {invalid ? t("modal.required") : error?.message}
        </div>
      )}
    </form>
  );
}

export default DraftForm;
