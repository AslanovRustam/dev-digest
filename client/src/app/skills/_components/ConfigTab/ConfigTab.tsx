/* ConfigTab — edit a skill (or create one on /skills/new): name, description,
   type and the body editor. Save versions the content with an optional
   "What changed?" note; the Enabled toggle of an existing skill saves at once
   and does not bump the version. Remount with `key={skill.id}` per skill. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { SkillType, Skill } from "@devdigest/shared";
import { SKILL_TYPES } from "@/components/skill-type-badge";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks";
import { DeleteSkillModal } from "@/app/skills/_components/DeleteSkillModal";
import { useToast } from "@/lib/toast";
import { VersionBadge } from "../VersionBadge";
import { BodyEditor } from "./_components/BodyEditor";
import { contentPatch, formFrom, isDirty, isValid, type SkillForm } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill?: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const toggle = useUpdateSkill();

  const base = formFrom(skill);
  const [form, setForm] = React.useState<SkillForm>(base);
  const [note, setNote] = React.useState("");
  // Create mode keeps `enabled` local; edit mode saves it immediately.
  const [draftEnabled, setDraftEnabled] = React.useState(true);

  const set = <K extends keyof SkillForm>(key: K) => (value: SkillForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = isDirty(form, base);
  const saving = create.isPending || update.isPending;
  const canSave = isValid(form) && (skill ? dirty : true) && !saving;
  // Show the requested state while the toggle's save is in flight.
  const pendingEnabled = toggle.isPending ? toggle.variables?.patch.enabled : undefined;
  const enabled = skill ? (pendingEnabled ?? skill.enabled) : draftEnabled;

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`config.types.${v}`) }));
  const fileName = form.name.trim() ? t("config.fileName", { name: form.name.trim() }) : t("config.untitledFile");
  const error = (skill ? update.error : create.error) ?? null;

  const onEnabled = (value: boolean) => {
    if (skill) toggle.mutate({ id: skill.id, patch: { enabled: value } });
    else setDraftEnabled(value);
  };

  const save = () => {
    const trimmedNote = note.trim() || undefined;
    if (skill) {
      update.mutate(
        { id: skill.id, patch: { ...contentPatch(form, base), note: trimmedNote } },
        {
          onSuccess: (saved) => {
            setNote("");
            toast.success(t("config.savedToast", { version: saved.version }));
          },
        },
      );
      return;
    }
    create.mutate(
      {
        name: form.name.trim(),
        description: form.description,
        type: form.type,
        body: form.body,
        enabled: draftEnabled,
        source: "manual",
        note: trimmedNote,
      },
      {
        onSuccess: (created) => {
          toast.success(t("config.createdToast"));
          router.push(`/skills/${created.id}`);
        },
      },
    );
  };

  const cancel = () => {
    setForm(base);
    setNote("");
  };

  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        {skill && <VersionBadge version={skill.version} />}
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={onEnabled} size={16} />
        </label>
      </div>

      <FormField label={t("config.name")} required>
        <TextInput
          mono
          value={form.name}
          onChange={set("name")}
          placeholder={t("config.namePlaceholder")}
          aria-label={t("config.name")}
          maxLength={120}
        />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <Textarea
          rows={2}
          value={form.description}
          onChange={set("description")}
          placeholder={t("config.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={form.type} onChange={(v) => set("type")(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} required>
        <BodyEditor fileName={fileName} value={form.body} onChange={set("body")} dirty={dirty} />
      </FormField>

      <div style={s.footer}>
        <FormField label={t("config.note")}>
          <TextInput
            value={note}
            onChange={setNote}
            placeholder={t("config.notePlaceholder")}
            aria-label={t("config.note")}
            maxLength={200}
          />
        </FormField>
        {error && (
          <div role="alert" style={s.error}>
            {error.message}
          </div>
        )}
        <div style={s.actions}>
          <Button kind="primary" icon="Check" onClick={save} disabled={!canSave} loading={saving}>
            {saving ? t("config.saving") : t("config.save")}
          </Button>
          <Button kind="secondary" onClick={cancel} disabled={saving || (!dirty && !note)}>
            {t("config.cancel")}
          </Button>
          {skill && (
            <Button kind="danger" icon="Trash" onClick={() => setConfirmingDelete(true)} style={s.delete}>
              {t("config.delete")}
            </Button>
          )}
          {skill && confirmingDelete && (
            <DeleteSkillModal skill={skill} onClose={() => setConfirmingDelete(false)} />
          )}
        </div>
      </div>
    </div>
  );
}
