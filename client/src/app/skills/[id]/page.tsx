/* Route: /skills/:id — skill list + detail. The tab lives in ?tab=
   (config | preview | stats | versions; anything else → config). */
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSkill } from "@/lib/hooks";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";
import { SkillDetail } from "./_components/SkillDetail";
import { parseSkillTab } from "./_components/SkillDetail/helpers";
import type { SkillTab } from "./_components/SkillDetail/constants";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const tab = parseSkillTab(search.get("tab"));
  const { data: skill } = useSkill(id);

  const setTab = (next: SkillTab) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  return (
    <SkillsWorkspace activeId={id} tab={tab} crumbTail={skill?.name}>
      <SkillDetail id={id} tab={tab} onTab={setTab} />
    </SkillsWorkspace>
  );
}
