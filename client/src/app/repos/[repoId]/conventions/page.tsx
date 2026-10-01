/* Conventions — /repos/:repoId/conventions (Skills Lab). Scan a cloned repo
   for house conventions, triage the evidence-backed candidates and merge the
   accepted ones into skills. Spec: specs/04-conventions-extractor.md. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const fullName = activeRepo?.id === repoId ? activeRepo.full_name : null;
  const repoName = activeRepo?.id === repoId ? activeRepo.name : t("page.repoFallback");

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbConventions") },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <ConventionsView repoId={repoId} repoName={repoName} repoFullName={fullName} />
    </AppShell>
  );
}
