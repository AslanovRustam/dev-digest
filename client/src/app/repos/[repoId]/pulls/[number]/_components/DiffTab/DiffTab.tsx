"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, SEV } from "@devdigest/ui";
import { DiffViewer, type DiffAnnotation, type DiffAnnotationApi, type DiffCommentApi } from "@/components/diff-viewer";
import {
  usePrComments,
  usePrReviews,
  useCreatePrComment,
  useFindingAction,
  useSmartDiff,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { GroupBadge } from "./_components/GroupBadge";
import { RoleGroup } from "./_components/RoleGroup";
import { COLLAPSED_ROLES, ROLE_META, type FileOrder } from "./constants";
import {
  countFilesWithFindings,
  latestReview,
  openFindingsByPath,
  orderFilesByRole,
  sortForDiff,
  topSeverity,
} from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  const [order, setOrder] = React.useState<FileOrder>("smart");

  const review = latestReview(reviews);
  const findings = review?.findings;
  const openByPath = React.useMemo(() => openFindingsByPath(findings ?? []), [findings]);

  const { mutate: mutateFinding, isPending: actionPending } = action;
  const items = React.useMemo<DiffAnnotation[]>(
    () =>
      sortForDiff(findings ?? []).map((f) => ({
        id: f.id,
        path: f.file,
        line: f.start_line,
        color: SEV[f.severity]?.c ?? "var(--text-muted)",
        label: t(`smartDiff.lineLabel.${f.severity}`),
        resolved: !!f.dismissed_at,
        content: (
          <FindingCard
            f={f}
            defaultExpanded
            pending={actionPending}
            repoFullName={repoFullName}
            headSha={headSha}
            onAction={(act) => mutateFinding({ findingId: f.id, action: act, prId: prId ?? undefined })}
          />
        ),
      })),
    [findings, t, actionPending, repoFullName, headSha, mutateFinding, prId],
  );

  // Hidden by default so the diff stays clean — except when the review left findings.
  const [commentsChoice, setCommentsChoice] = React.useState<boolean | null>(null);
  const showComments = commentsChoice ?? items.length > 0;
  const commentCount = (comments?.length ?? 0) + items.length;

  const annotations: DiffAnnotationApi = {
    items,
    show: showComments,
    markerLabel: t("smartDiff.fileHasFindings"),
  };

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setCommentsChoice(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const groups = order === "smart" && smartDiff ? orderFilesByRole(files, smartDiff) : null;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.toolbar}>
            {smartDiff && (
              <div role="group" aria-label={t("smartDiff.orderLabel")} style={s.toolbar}>
                <Button
                  kind="ghost"
                  size="sm"
                  active={order === "smart"}
                  aria-pressed={order === "smart"}
                  onClick={() => setOrder("smart")}
                >
                  {t("smartDiff.smartOrder")}
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  active={order === "original"}
                  aria-pressed={order === "original"}
                  onClick={() => setOrder("original")}
                >
                  {t("smartDiff.originalOrder")}
                </Button>
              </div>
            )}
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setCommentsChoice(!showComments)}
              >
                {t(showComments ? "smartDiff.hideComments" : "smartDiff.showComments", { count: commentCount })}
              </Button>
            )}
          </div>
        }
      >
        {t("smartDiff.filesChanged", { count: filesCount })}
      </SectionLabel>
      {!review && <p style={s.notRun}>{t("smartDiff.reviewNotRun")}</p>}
      {groups ? (
        <div style={s.groups}>
          {groups.map((g) => {
            const count = countFilesWithFindings(g.files, openByPath);
            const top = topSeverity(g.files.flatMap((f) => openByPath.get(f.path) ?? []));
            const meta = ROLE_META[g.role];
            return (
              <RoleGroup
                key={g.role}
                heading={{
                  label: t(`smartDiff.${meta.labelKey}`),
                  hint: t(`smartDiff.${meta.hintKey}`),
                  color: meta.color,
                }}
                files={g.files}
                defaultOpen={!COLLAPSED_ROLES.has(g.role)}
                commenting={commenting}
                annotations={annotations}
                badge={
                  review && count > 0 ? (
                    <GroupBadge count={count} color={(top && SEV[top as keyof typeof SEV]?.c) || "var(--text-muted)"} />
                  ) : undefined
                }
              />
            );
          })}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} annotations={annotations} />
      )}
    </section>
  );
}
