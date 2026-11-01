/* Project Context — /repos/:repoId/context (Workspace). The clone's markdown
   documents (specs/, docs/, insights/): browse, preview, edit or upload as a
   PR, and see which agents use each. Spec: specs/2026-11-01-project-context.md. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { ContextView } from "./_components/ContextView";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const repoNotFound = useRepoNotFound(repoId);
  const crumb = [{ label: t("page.crumbWorkspace") }, { label: t("page.crumbContext") }];

  return (
    <AppShell crumb={crumb}>
      {repoNotFound ? <RepoNotFound /> : <ContextView key={repoId} repoId={repoId} />}
    </AppShell>
  );
}
