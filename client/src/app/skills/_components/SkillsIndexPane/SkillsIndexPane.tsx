/* SkillsIndexPane — right pane of /skills before a skill is picked: a
   "Select a skill" hint, or the first-run empty state with Create / Import. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@devdigest/ui";
import { useSkills } from "@/lib/hooks";
import { s } from "./styles";

export function SkillsIndexPane({ onImport }: { onImport: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError } = useSkills();

  // The list column already shows loading skeletons and the load error.
  if (isLoading || isError || !skills) return null;

  if (skills.length > 0) {
    return <EmptyState icon="Sparkles" title={t("index.selectTitle")} body={t("index.selectBody")} />;
  }

  return (
    <div style={s.wrap}>
      <EmptyState icon="Sparkles" title={t("index.emptyTitle")} body={t("index.emptyBody")} />
      <div style={s.actions}>
        <Button kind="primary" icon="Plus" onClick={() => router.push("/skills/new")}>
          {t("index.emptyCreate")}
        </Button>
        <Button kind="secondary" icon="Upload" onClick={onImport}>
          {t("index.emptyImport")}
        </Button>
      </div>
    </div>
  );
}
