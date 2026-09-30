/* Route: /skills/new — the skill list + a blank Config form (type custom).
   Saving creates the skill and navigates to /skills/:id. */
"use client";

import { useTranslations } from "next-intl";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";
import { NewSkillPane } from "./_components/NewSkillPane";

export default function NewSkillPage() {
  const t = useTranslations("skills");
  return (
    <SkillsWorkspace crumbTail={t("crumb.new")}>
      <NewSkillPane />
    </SkillsWorkspace>
  );
}
