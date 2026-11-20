"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { useGenerateBrief, usePrBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefCard, ReviewFocus, RiskAreas, newestVerdictReview } from "../PrBrief";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
  /** Open Files changed at a file (and line); wired by the page. */
  onOpenInDiff: (file: string, line: number | null) => void;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha, onOpenInDiff }: OverviewTabProps) {
  const brief = usePrBrief(prId);
  const generate = useGenerateBrief(prId ?? "");
  const reviews = usePrReviews(prId);
  const stored = brief.data?.brief ?? null;

  return (
    <>
      {prId && (
        <PrBriefCard
          brief={{ data: brief.data, isLoading: brief.isLoading, error: brief.error, refetch: () => void brief.refetch() }}
          generate={{ isPending: generate.isPending, error: generate.error, mutate: () => generate.mutate() }}
          review={newestVerdictReview(reviews.data)}
        />
      )}
      {prId && (
        <div style={s.briefGrid}>
          <div style={s.column}>
            <IntentCard prId={prId} hideRiskAreas={!!stored} />
            {stored && <RiskAreas risks={stored.risks} onOpenInDiff={onOpenInDiff} />}
          </div>
          <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      )}
      {stored && <ReviewFocus items={stored.review_focus} onOpenInDiff={onOpenInDiff} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
