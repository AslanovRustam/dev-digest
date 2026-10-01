/* ConventionsView — the Conventions Extractor page body: scan header (Re-scan,
   sample size, what the evidence gate dropped), status / category filters,
   bulk triage, the candidate cards and the "Create skill" modal. Every list
   mutation returns the full ConventionsList, so the cache is always the
   server's truth. */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionPatch } from "@devdigest/shared";
import {
  useBulkConventionStatus,
  useConventions,
  useExtractConventions,
  usePatchConvention,
} from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { ConventionCard } from "./_components/ConventionCard";
import { ConventionsHeader } from "./_components/ConventionsHeader";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import {
  CATEGORIES,
  SKELETON_CARDS,
  STATUS_FILTERS,
  type CategoryFilter,
  type StatusFilter,
} from "./constants";
import { countBy, filterCandidates, parseCategory, parseStatus, skillCandidates } from "./helpers";
import { s } from "./styles";

export function ConventionsView({
  repoId,
  repoName,
  repoFullName,
}: {
  repoId: string;
  /** Short repo name for the heading (e.g. "payments-api"). */
  repoName: string;
  /** owner/name for GitHub links; null while the repo list loads. */
  repoFullName: string | null;
}) {
  const t = useTranslations("conventions");
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const bulk = useBulkConventionStatus(repoId);
  // Filters live in the URL (?status&category) so a reload, a back-navigation
  // from a linked skill or a shared link keeps them — same as the Pulls page.
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = parseStatus(search.get("status"));
  const category = parseCategory(search.get("category"));
  const setFilter = (key: "status" | "category", value: string) => {
    const sp = new URLSearchParams(search.toString());
    if (value === "all") sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };
  const setStatus = (v: StatusFilter) => setFilter("status", v);
  const setCategory = (v: CategoryFilter) => setFilter("category", v);
  const [creating, setCreating] = React.useState(false);

  const candidates = data?.candidates ?? [];
  const scan = data?.scan ?? null;
  const counts = countBy(candidates);
  const visible = filterCandidates(candidates, status, category);
  const forSkill = skillCandidates(candidates, category);
  const visibleAccepted = visible.filter((c) => c.status === "accepted" && !c.skill_id);
  const visiblePending = visible.filter((c) => c.status === "pending");
  const scanning = extract.isPending;

  const onPatch = (id: string) => (p: ConventionPatch) => patch.mutate({ id, patch: p });
  const header = (
    <ConventionsHeader
      repoName={repoName}
      scan={scan}
      scanning={scanning}
      showRescan={!!scan || candidates.length > 0}
      onRescan={() => extract.mutate()}
    />
  );

  if (isLoading) {
    return (
      <div style={s.wrap}>
        {header}
        <div style={s.list}>
          {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
            <Skeleton key={i} height={180} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={s.wrap}>
        {header}
        <ErrorState
          title={t("page.loadError")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div style={s.wrap}>
        {header}
        <div style={s.emptyCard}>
          {scan ? (
            <EmptyState
              icon="ListChecks"
              title={t("page.noneSurvived.title")}
              body={t("page.noneSurvived.body", { proposed: scan.proposed })}
              cta={t("page.rescan")}
              onCta={() => extract.mutate()}
              ctaLoading={scanning}
            />
          ) : (
            <EmptyState
              icon="ListChecks"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => extract.mutate()}
              ctaLoading={scanning}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      {header}

      <div style={s.toolbar}>
        {visibleAccepted.length > 0 ? (
          <Button
            icon="X"
            onClick={() => bulk.mutate({ ids: visibleAccepted.map((c) => c.id), status: "pending" })}
            loading={bulk.isPending}
          >
            {t("toolbar.deselectAll")}
          </Button>
        ) : (
          <Button
            icon="Check"
            onClick={() => bulk.mutate({ ids: visiblePending.map((c) => c.id), status: "accepted" })}
            disabled={visiblePending.length === 0}
            loading={bulk.isPending}
          >
            {t("toolbar.acceptAll")}
          </Button>
        )}
        <span style={s.count}>
          {t("toolbar.acceptedCount", { accepted: counts.status.accepted, total: counts.status.all })}
        </span>
        <span style={s.spacer} />
        <span title={t("toolbar.createSkillHint")}>
          <Button kind="primary" icon="Sparkles" disabled={forSkill.length === 0} onClick={() => setCreating(true)}>
            {t("toolbar.createSkill")}
            {forSkill.length > 0 ? ` (${forSkill.length})` : ""}
          </Button>
        </span>
      </div>

      <div style={s.filters} role="group" aria-label={t("page.crumbConventions")}>
        {STATUS_FILTERS.map((k) => (
          <Chip key={k} active={status === k} count={counts.status[k]} onClick={() => setStatus(k)}>
            {t(`toolbar.status.${k}`)}
          </Chip>
        ))}
        <span style={s.divider} />
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          {t("toolbar.allCategories")}
        </Chip>
        {CATEGORIES.filter((k) => counts.category.has(k)).map((k) => (
          <Chip key={k} active={category === k} count={counts.category.get(k)} onClick={() => setCategory(k)}>
            {t(`category.${k}`)}
          </Chip>
        ))}
      </div>

      <div style={s.list}>
        {visible.length === 0 ? (
          <p style={s.noMatch}>{t("page.noMatch")}</p>
        ) : (
          visible.map((c) => (
            <ConventionCard key={c.id} candidate={c} repoFullName={repoFullName} onPatch={onPatch(c.id)} />
          ))
        )}
      </div>

      {creating && forSkill.length > 0 && (
        <CreateSkillModal
          repoId={repoId}
          repoName={repoName}
          candidates={forSkill}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

export default ConventionsView;
