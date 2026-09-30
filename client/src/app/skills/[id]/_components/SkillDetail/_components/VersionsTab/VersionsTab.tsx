/* VersionsTab — every content save is a snapshot. The current version shows
   "Current"; older ones can be diffed against the current body inline, or
   restored (which writes a NEW version — history is never rewritten). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { VersionDiff } from "./_components/VersionDiff";
import { formatVersionDate, newestFirst } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [openDiff, setOpenDiff] = React.useState<number | null>(null);

  const versions = newestFirst(data ?? []);

  const onRestore = (version: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    restore.mutate(
      { id: skill.id, version },
      {
        onSuccess: (saved) => {
          setOpenDiff(null);
          toast.success(t("versions.restoredToast", { version, current: saved.version }));
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        {data && <Badge>{t("versions.count", { count: versions.length })}</Badge>}
      </div>
      <p style={s.caption}>{t("versions.caption")}</p>

      {isLoading && (
        <div style={s.skeletons}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      )}
      {isError && <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />}
      {data && versions.length === 0 && <div style={s.empty}>{t("versions.empty")}</div>}

      {versions.length > 0 && (
        <ul style={s.list}>
          {versions.map((v) => {
            const current = v.version === skill.version;
            const diffOpen = openDiff === v.version;
            return (
              <li key={v.version} style={s.row}>
                <div style={s.rowMain}>
                  <Badge
                    mono
                    color={current ? "var(--accent-text)" : "var(--text-secondary)"}
                    bg={current ? "var(--accent-bg)" : "var(--bg-hover)"}
                    style={s.vBadge}
                  >
                    {t("versions.badge", { version: v.version })}
                  </Badge>
                  <div style={s.meta}>
                    <div style={s.note}>{v.note || t("versions.noNote")}</div>
                    <div className="mono" style={s.date}>
                      {formatVersionDate(v.created_at)}
                    </div>
                  </div>
                  {current ? (
                    <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                      {t("versions.current")}
                    </Badge>
                  ) : (
                    <div style={s.actions}>
                      <Button
                        kind="ghost"
                        size="sm"
                        icon="Eye"
                        aria-expanded={diffOpen}
                        onClick={() => setOpenDiff(diffOpen ? null : v.version)}
                      >
                        {diffOpen ? t("versions.hideDiff") : t("versions.diff")}
                      </Button>
                      <Button
                        kind="ghost"
                        size="sm"
                        icon="RotateCcw"
                        onClick={() => onRestore(v.version)}
                        disabled={restore.isPending}
                      >
                        {t("versions.restore")}
                      </Button>
                    </div>
                  )}
                </div>
                {diffOpen && <VersionDiff from={v.body} to={skill.body} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
