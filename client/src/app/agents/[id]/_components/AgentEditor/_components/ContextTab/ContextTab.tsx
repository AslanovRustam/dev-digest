/* ContextTab — the agent's project documents (L05): its own, ordered, plus the
   ones it inherits from enabled skill links, counted against the active repo.
   Every change saves the whole ordered list (optimistic PUT /agents/:id/context);
   the agent's version does not change. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { ContextAttachments, type ContextRepoState } from "@/components/context-attachments";
import { ApiError } from "@/lib/api";
import { useContextAttachments, useContextDocs, useSetContextAttachments } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ agentId }: { agentId: string }) {
  const t = useTranslations("context.attachments");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const docsQ = useContextDocs(repoId);
  const attachmentsQ = useContextAttachments("agent", agentId, repoId);
  const setAttachments = useSetContextAttachments("agent", agentId, repoId);

  if (attachmentsQ.error instanceof ApiError && attachmentsQ.error.status === 404) {
    return <EmptyState icon="Cpu" title={t("notFound")} />;
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
      mode="agent"
      repoId={repoId}
      repoState={repoState}
      view={attachmentsQ.data}
      documents={docsQ.data?.documents ?? []}
      onSave={(paths) => setAttachments.mutate(paths)}
      saveError={setAttachments.error ? setAttachments.error.message : null}
    />
  );
}
