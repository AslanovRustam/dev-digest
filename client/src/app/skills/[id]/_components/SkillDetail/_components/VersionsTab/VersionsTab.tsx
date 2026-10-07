/* VersionsTab — every content save is a snapshot. Each version's Diff shows
   what THAT version changed: its body against the previous version's (v1
   against an empty body). The current version is marked "Current"; older ones
   can be restored, which writes a NEW version — history is never rewritten. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { VersionDiff } from "./_components/VersionDiff";
import { formatVersionDate, newestFirst, previousVersion } from "./helpers";
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
            const prev = previousVersion(versions, v.version);
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
                    {/* Current and Restore share one grid cell; the other one is an
                        invisible, inert sizer, so the slot is as wide as the wider
                        of the two on every row — Diff stays in one column. */}
                    <div style={s.trailing}>
                      <div style={current ? s.trailingItem : s.trailingSizer} aria-hidden={!current} inert={!current}>
                        <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                          {t("versions.current")}
                        </Badge>
                      </div>
                      <div style={current ? s.trailingSizer : s.trailingItem} aria-hidden={current} inert={current}>
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
                    </div>
                  </div>
                </div>
                {diffOpen && (
                  <>
                    <div style={s.diffCaption}>
                      {prev
                        ? t("versions.diffAgainst", { version: v.version, previous: prev.version })
                        : t("versions.diffInitial", { version: v.version })}
                    </div>
                    <VersionDiff from={prev?.body ?? ""} to={v.body} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
