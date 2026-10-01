/* CreateSkillModal — "Create skill from conventions". The server merges the
   accepted candidates into a draft (name, directive description, body with
   each rule and its real evidence); everything is editable here before the
   skill exists. Saving re-checks server-side that every candidate is still
   accepted, writes the skill as v1 (source "extracted") and can link it to an
   agent in the same step. Portalled + event-isolated like DeleteSkillModal. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  Icon,
  Modal,
  SelectInput,
  Skeleton,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { BodyEditor } from "@/components/skill-body-editor";
import { SKILL_TYPES } from "@/components/skill-type-badge";
import { useAgents, useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

interface Form {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  agentId: string;
}

export function CreateSkillModal({
  repoId,
  repoName,
  candidates,
  onClose,
}: {
  repoId: string;
  repoName: string;
  /** Accepted candidates to merge — the caller never passes pending or rejected ones. */
  candidates: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const ids = React.useMemo(() => candidates.map((c) => c.id), [candidates]);
  const draft = useConventionSkillDraft(repoId, ids, true);
  const agents = useAgents();
  const create = useCreateSkillFromConventions(repoId);
  const [form, setForm] = React.useState<Form | null>(null);

  React.useEffect(() => {
    if (draft.data && !form) {
      setForm({
        name: draft.data.name,
        description: draft.data.description,
        type: draft.data.type,
        enabled: true,
        body: draft.data.body,
        agentId: "",
      });
    }
  }, [draft.data, form]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !create.isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, create.isPending]);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const canSave = !!form && form.name.trim().length > 0 && form.body.trim().length > 0;

  const save = () => {
    if (!form || !canSave) return;
    create.mutate(
      {
        convention_ids: ids,
        name: form.name.trim(),
        description: form.description,
        type: form.type,
        enabled: form.enabled,
        body: form.body,
        agent_ids: form.agentId ? [form.agentId] : [],
      },
      {
        onSuccess: (created) => {
          const agent = agents.data?.find((a) => a.id === form.agentId);
          toast.success(
            agent
              ? t("modal.createdLinkedToast", { name: created.name, agent: agent.name })
              : t("modal.createdToast", { name: created.name }),
          );
          onClose();
        },
      },
    );
  };

  const agentOptions = [
    { value: "", label: t("modal.agentNone") },
    ...(agents.data ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  return createPortal(
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Modal
        width={880}
        title={t("modal.title")}
        subtitle={form ? <span className="mono">{form.name || " "}</span> : undefined}
        onClose={create.isPending ? undefined : onClose}
        footer={
          <div style={s.footer}>
            <span style={s.savedAs}>
              <Icon.GitCommit size={13} />
              {t.rich("modal.savedAs", { b: (chunks) => <b className="mono">{chunks}</b> })}
            </span>
            <span style={s.spacer} />
            <Button kind="secondary" onClick={onClose} disabled={create.isPending}>
              {t("modal.cancel")}
            </Button>
            <Button kind="primary" icon="Sparkles" onClick={save} disabled={!canSave} loading={create.isPending}>
              {create.isPending ? t("modal.creating") : t("modal.create")}
            </Button>
          </div>
        }
      >
        <div style={s.body}>
          <div style={s.banner}>
            <Icon.GitMerge size={15} style={s.bannerIcon} />
            <span>
              {t.rich("modal.banner", {
                count: candidates.length,
                repo: repoName,
                b: (chunks) => <b>{chunks}</b>,
                accent: (chunks) => (
                  <span className="mono" style={s.accent}>
                    {chunks}
                  </span>
                ),
              })}
            </span>
          </div>

          {draft.isError ? (
            <div role="alert" style={s.error}>
              {draft.error instanceof Error ? draft.error.message : t("modal.draftError")}
            </div>
          ) : !form ? (
            <div style={s.loading} aria-label={t("modal.draftLoading")}>
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={220} />
            </div>
          ) : (
            <>
              <FormField label={t("modal.name")} required>
                <TextInput
                  mono
                  value={form.name}
                  onChange={set("name")}
                  aria-label={t("modal.name")}
                  maxLength={120}
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
                  <SelectInput
                    value={form.type}
                    onChange={(v) => set("type")(v as SkillType)}
                    options={SKILL_TYPES}
                  />
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
              {create.error && (
                <div role="alert" style={s.error}>
                  {create.error.message}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>,
    document.body,
  );
}

export default CreateSkillModal;
