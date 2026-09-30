/* SkillRow — one workspace skill in the agent's Skills tab: drag handle,
   per-agent checkbox, name and type badge. Drag events are owned by SkillsTab
   and passed in as `dragHandlers`; Alt+ArrowUp/Down is the keyboard move. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Icon } from "@devdigest/ui";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import type { SkillRowModel } from "../../helpers";
import { s } from "./styles";

export type DragHandlers = Pick<
  React.HTMLAttributes<HTMLLIElement>,
  "onDragStart" | "onDragOver" | "onDragLeave" | "onDrop" | "onDragEnd"
>;

export function SkillRow({
  row,
  reorderable,
  dragging,
  over,
  onToggle,
  onMove,
  dragHandlers,
}: {
  row: SkillRowModel;
  /** Linked row and no active filter: can be dragged, dropped on and moved by keyboard. */
  reorderable: boolean;
  dragging: boolean;
  over: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  dragHandlers: DragHandlers;
}) {
  const t = useTranslations("agents");
  const { skill, enabled } = row;
  const globallyOff = !skill.enabled;

  const onKeyDown = (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (!reorderable || !e.altKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onMove(e.key === "ArrowUp" ? -1 : 1);
    }
  };

  return (
    <li
      draggable={reorderable}
      onKeyDown={onKeyDown}
      data-skill-id={skill.id}
      style={s.row({ checked: enabled, dimmed: globallyOff, dragging, over })}
      {...(reorderable ? dragHandlers : {})}
    >
      <button
        type="button"
        aria-label={t("skills.reorder", { name: skill.name })}
        aria-disabled={!reorderable}
        title={reorderable ? t("skills.reorderHint") : undefined}
        style={s.handle(reorderable)}
      >
        <Icon.GripVertical size={14} />
      </button>
      <Checkbox
        checked={enabled}
        onChange={onToggle}
        label={
          <span className="mono" style={s.name}>
            {skill.name}
          </span>
        }
      />
      {globallyOff && <span style={s.globalNote}>{t("skills.disabledGlobally")}</span>}
      <span style={s.badge}>
        <SkillTypeBadge type={skill.type} />
      </span>
    </li>
  );
}
