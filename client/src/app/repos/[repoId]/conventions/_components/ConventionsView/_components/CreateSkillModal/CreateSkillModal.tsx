/* CreateSkillModal — "Create skill from conventions". The server merges the
   accepted candidates into a draft (name, directive description, body with
   each rule and its real evidence); everything is editable here before the
   skill exists. Saving re-checks server-side that every candidate is still
   accepted, writes the skill as v1 (source "extracted") and can link it to an
   agent in the same step. Portalled + event-isolated like DeleteSkillModal.
   The editable form mounts only once the draft has arrived, so its state is
   seeded from the draft instead of being synced into it by an effect. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useAgents, useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { DraftForm, type DraftFormValues, type ModalFrame } from "./_components/DraftForm";
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

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !create.isPending) onClose();
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

  /** The dialog chrome shared by the loading state and the form. */
  const frame: ModalFrame = ({ subtitle, footer, children }) => (
    <Modal
      width={880}
      title={t("modal.title")}
      subtitle={subtitle}
      onClose={create.isPending ? undefined : onClose}
      footer={
        <div style={s.footer}>
          <span style={s.savedAs}>
            <Icon.GitCommit size={13} />
            {t.rich("modal.savedAs", { b: (chunks) => <b className="mono">{chunks}</b> })}
          </span>
          <span style={s.spacer} />
          {footer}
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
        {children}
      </div>
    </Modal>
  );

  return createPortal(
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {draft.data ? (
        <DraftForm
          draft={draft.data}
          agents={agents.data ?? []}
          saving={create.isPending}
          error={create.error}
          onSave={save}
          onCancel={onClose}
          frame={frame}
        />
      ) : (
        frame({
          footer: (
            <>
              <Button kind="secondary" onClick={onClose}>
                {t("modal.cancel")}
              </Button>
              <Button kind="primary" icon="Sparkles" disabled>
                {t("modal.create")}
              </Button>
            </>
          ),
          children: draft.isError ? (
            <div role="alert" style={s.error}>
              {draft.error instanceof Error ? draft.error.message : t("modal.draftError")}
            </div>
          ) : (
            <div style={s.loading} aria-label={t("modal.draftLoading")}>
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={220} />
            </div>
          ),
        })
      )}
    </div>,
    document.body,
  );
}

export default CreateSkillModal;
