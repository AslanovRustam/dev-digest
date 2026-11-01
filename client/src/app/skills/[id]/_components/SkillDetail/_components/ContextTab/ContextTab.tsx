/* ContextTab — the skill's "Project context to use" (L05): documents every agent
   with an enabled link to this skill inherits, counted against the active repo,
   plus what they serialize as. Every change saves the whole ordered list; the
   skill's version does not change. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { ContextAttachments, type ContextRepoState } from "@/components/context-attachments";
import { ApiError } from "@/lib/api";
import { useContextAttachments, useContextDocs, useSetContextAttachments } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("context.attachments");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const docsQ = useContextDocs(repoId);
  const attachmentsQ = useContextAttachments("skill", skillId, repoId);
  const setAttachments = useSetContextAttachments("skill", skillId, repoId);

  if (attachmentsQ.error instanceof ApiError && attachmentsQ.error.status === 404) {
    return <EmptyState icon="Sparkles" title={t("notFound")} />;
  }
  if (attachmentsQ.isError || docsQ.isError) {
    return (
      <ErrorState
        body={t("loadError")}
        onRetry={() => {
          void attachmentsQ.refetch();
          void docsQ.refetch();
        }}
      />
    );
  }
  if (!attachmentsQ.data || (repoId && docsQ.isLoading)) {
    return (
      <div style={s.skeletons} role="status" aria-label={t("listLabel")}>
        <Skeleton height={24} width={220} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  const repoState: ContextRepoState = !repoId ? "no_repo" : docsQ.data?.state === "not_cloned" ? "not_cloned" : "ok";
  return (
    <ContextAttachments
      mode="skill"
      repoId={repoId}
      repoState={repoState}
      view={attachmentsQ.data}
      documents={docsQ.data?.documents ?? []}
      onSave={(paths) => setAttachments.mutate(paths)}
      saveError={setAttachments.error ? setAttachments.error.message : null}
    />
  );
}
