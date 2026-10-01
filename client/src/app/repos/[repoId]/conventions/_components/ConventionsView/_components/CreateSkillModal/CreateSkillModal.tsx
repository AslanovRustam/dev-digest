/* CreateSkillModal — "Create skill from conventions". The server merges the
   accepted candidates into a draft (name, directive description, body with
   each rule and its real evidence); everything is editable here before the
   skill exists. Saving re-checks server-side that every candidate is still
   accepted, writes the skill as v1 (source "extracted") and can link it to an
   agent in the same step.
   The Modal is rendered once; only its body swaps from the loading state to
   the form, which mounts when the draft arrives (state seeded from it, no
   effect) and is submitted by the footer button through `form=`. Portalled +
   event-isolated like DeleteSkillModal; Escape is handled on the wrapper
   (which stops keydown from reaching window) and on window (focus outside). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useAgents, useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { DraftForm, type DraftFormValues } from "./_components/DraftForm";
import { FORM_ID } from "./constants";
import { s } from "./styles";

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
  const ids = candidates.map((c) => c.id);
  const draft = useConventionSkillDraft(repoId, ids, true);
  const agents = useAgents();
  const create = useCreateSkillFromConventions(repoId);
  const close = create.isPending ? undefined : onClose;

  // Escape while focus is still outside the dialog (draft loading or failed —
  // the form's autofocus has not happened yet). Inside, the wrapper handles it.
  React.useEffect(() => {
    if (create.isPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, create.isPending]);

  const save = (form: DraftFormValues) => {
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

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") close?.();
      }}
    >
      <Modal
        width={880}
        title={t("modal.title")}
        subtitle={draft.data ? <span className="mono">{draft.data.name}</span> : undefined}
        onClose={close}
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
            <Button
              kind="primary"
              icon="Sparkles"
              type="submit"
              form={FORM_ID}
              disabled={!draft.data}
              loading={create.isPending}
            >
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
          {draft.data ? (
            <DraftForm
              id={FORM_ID}
              draft={draft.data}
              agents={agents.data ?? []}
              error={create.error}
              onSubmit={save}
            />
          ) : draft.isError ? (
            <div role="alert" style={s.error}>
              {draft.error instanceof Error ? draft.error.message : t("modal.draftError")}
            </div>
          ) : (
            <div style={s.loading} aria-label={t("modal.draftLoading")}>
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={220} />
            </div>
          )}
        </div>
      </Modal>
    </div>,
    document.body,
  );
}

export default CreateSkillModal;
