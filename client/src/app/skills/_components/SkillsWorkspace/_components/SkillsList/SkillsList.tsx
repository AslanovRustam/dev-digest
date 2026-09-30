/* SkillsList — left column of the Skills page: title, "Add Skill" menu
   (create / import), search, and one SkillCard per workspace skill. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "@/lib/hooks";
import { SkillCard } from "./_components/SkillCard";
import { filterSkills, skillHref } from "./helpers";
import { s } from "./styles";

export function SkillsList({
  activeId,
  tab,
  onImport,
}: {
  activeId?: string;
  tab?: string;
  onImport: () => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const toggle = useUpdateSkill();
  const [query, setQuery] = React.useState("");

  const list = filterSkills(skills ?? [], query);

  return (
    <>
      <div style={s.head}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("list.title")}</h1>
          <Dropdown
            width={200}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("list.addSkill")}
              </Button>
            }
            items={[
              { label: t("list.createSkill"), icon: "Edit", onClick: () => router.push("/skills/new") },
              { label: t("list.importFromFile"), icon: "Upload", onClick: onImport },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.searchPlaceholder")}
            aria-label={t("list.searchLabel")}
            style={s.searchInput}
          />
        </div>
      </div>

      <div style={s.scroll}>
        {isLoading && (
          <div style={s.skeletons}>
            <Skeleton height={112} />
            <Skeleton height={112} />
            <Skeleton height={112} />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && query.trim() !== "" && (
          <div style={s.noMatch}>{t("list.noMatch", { query: query.trim() })}</div>
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => router.push(skillHref(sk.id, tab))}
            onToggle={(enabled) => toggle.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
    </>
  );
}
