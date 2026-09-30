/* SkillsWorkspace — the master/detail shell shared by /skills, /skills/new and
   /skills/[id]: AppShell breadcrumb, the skill list on the left, the route's
   pane on the right. It owns the "Import from file" modal so both the list's
   Add menu and the empty state can open it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Crumb } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SkillsList } from "./_components/SkillsList";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { s } from "./styles";

export interface SkillsWorkspaceApi {
  openImport: () => void;
}

export function SkillsWorkspace({
  activeId,
  tab,
  crumbTail,
  children,
}: {
  /** Selected skill (highlighted in the list). */
  activeId?: string;
  /** Detail tab to keep when switching skills from the list. */
  tab?: string;
  /** Last breadcrumb segment (skill name, "New skill"). */
  crumbTail?: string;
  children: React.ReactNode | ((api: SkillsWorkspaceApi) => React.ReactNode);
}) {
  const t = useTranslations("skills");
  const [importing, setImporting] = React.useState(false);
  const openImport = React.useCallback(() => setImporting(true), []);

  const crumb: Crumb[] = [
    { label: t("crumb.lab") },
    crumbTail ? { label: t("crumb.skills"), href: "/skills" } : { label: t("crumb.skills") },
    ...(crumbTail ? [{ label: crumbTail }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      {importing && <ImportSkillModal onClose={() => setImporting(false)} />}
      <div style={s.layout}>
        <aside style={s.list}>
          <SkillsList activeId={activeId} tab={tab} onImport={openImport} />
        </aside>
        <section style={s.pane}>{typeof children === "function" ? children({ openImport }) : children}</section>
      </div>
    </AppShell>
  );
}
