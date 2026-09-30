/* SkillsTab — the agent's skill set (L02). Every workspace skill is a row:
   linked skills first in the agent's order, then unlinked ones by name. The
   checkbox is the per-agent switch; every check, drop or keyboard move saves
   the whole ordered list at once (optimistic PUT /agents/:id/skills). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SkillRow, type DragHandlers } from "./_components/SkillRow";
import { filterRows, linkedCount, mergeRows, moveItem, toggleRow, toItems, type SkillRowModel } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  // Skill moved by keyboard whose handle should keep focus. React re-inserts a
  // row it moves down, which blurs it; put focus back once that has happened.
  const refocusId = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = refocusId.current;
    const active = document.activeElement;
    if (!id || !listRef.current || (active && active !== document.body)) return;
    const row = Array.from(listRef.current.children).find(
      (li): li is HTMLElement => li instanceof HTMLElement && li.dataset.skillId === id,
    );
    row?.querySelector("button")?.focus();
    refocusId.current = null;
  });

  if (skillsQ.isError || linksQ.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skillsQ.refetch();
          void linksQ.refetch();
        }}
      />
    );
  }
  if (skillsQ.isLoading || linksQ.isLoading) {
    return (
      <div style={s.skeletons}>
        <Skeleton height={24} width={220} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  const skills = skillsQ.data ?? [];
  if (skills.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.emptyTitle")}
        body={
          <>
            {t("skills.emptyBody")}{" "}
            <Link href="/skills" style={s.emptyLink}>
              {t("skills.emptyCta")}
            </Link>
          </>
        }
      />
    );
  }

  const rows = mergeRows(skills, linksQ.data ?? []);
  const linked = linkedCount(rows);
  const enabledCount = rows.filter((r) => r.enabled).length;
  const filtering = filter.trim() !== "";
  const visible = filterRows(rows, filter);

  const save = (next: SkillRowModel[]) => setSkills.mutate({ items: toItems(next) });
  const indexOf = (id: string) => rows.findIndex((r) => r.skill.id === id);
  const clearDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  const move = (id: string, delta: -1 | 1) => {
    const from = indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= linked) return;
    refocusId.current = id;
    save(moveItem(rows, from, to));
  };

  const dragHandlersFor = (id: string): DragHandlers => ({
    onDragStart: (e) => {
      setDragId(id);
      e.dataTransfer?.setData("text/plain", id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e) => {
      if (!dragId || dragId === id) return;
      e.preventDefault(); // marks this row as a valid drop target
      if (overId !== id) setOverId(id);
    },
    onDrop: (e) => {
      e.preventDefault();
      const from = dragId ? indexOf(dragId) : -1;
      const to = indexOf(id);
      clearDrag();
      if (from !== -1 && from !== to) save(moveItem(rows, from, to));
    },
    onDragEnd: clearDrag,
  });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)" style={s.countBadge}>
          {t("skills.enabledCount", { enabled: enabledCount, total: skills.length })}
        </Badge>
        <label style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </label>
      </div>
      <p style={s.hint}>{filtering ? t("skills.filterActiveHint") : t("skills.orderHint")}</p>
      {visible.length === 0 ? (
        <p style={s.noMatches}>{t("skills.noMatches", { q: filter.trim() })}</p>
      ) : (
        <ul ref={listRef} style={s.list} aria-label={t("skills.listLabel")}>
          {visible.map((row) => {
            const id = row.skill.id;
            return (
              <SkillRow
                key={id}
                row={row}
                reorderable={row.linked && !filtering}
                dragging={dragId === id}
                over={overId === id}
                onToggle={() => save(toggleRow(rows, id))}
                onMove={(delta) => move(id, delta)}
                dragHandlers={dragHandlersFor(id)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
