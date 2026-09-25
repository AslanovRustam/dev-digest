/* FindingsCell — the PR list's FINDINGS column: open findings of the latest
   review batch per severity. Hovering previews them; the findings themselves are
   fetched only when the card opens (GET /pulls/:id/reviews, narrowed to the
   batch's `latest_review_ids`), so the list stays one request. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import { HoverCard } from "@/components/hover-card";
import { SeverityTally } from "@/components/severity-tally";
import { FindingsPreviewList } from "@/components/findings-preview";
import { usePrReviews } from "@/lib/hooks/reviews";
import { liveFindings, sortForPreview, tallyFromCounts, tallyTotal } from "@/lib/findings";
import { s } from "./styles";

export function FindingsCell({ pr, repoFullName }: { pr: PrMeta; repoFullName?: string | null }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const { data: reviews, isError } = usePrReviews(pr.id, open);

  const findings = React.useMemo(() => {
    if (!reviews) return [];
    const scope = new Set(pr.latest_review_ids ?? []);
    return sortForPreview(liveFindings(reviews.filter((r) => scope.has(r.id)).flatMap((r) => r.findings)));
  }, [reviews, pr.latest_review_ids]);

  // Never reviewed.
  if (!pr.findings) return <span style={s.muted}>—</span>;
  const tally = tallyFromCounts(pr.findings);
  if (tallyTotal(tally) === 0) return <span style={s.none}>{t("list.findingsNone")}</span>;

  return (
    <HoverCard trigger={<SeverityTally counts={tally} />} onOpenChange={setOpen}>
      <FindingsPreviewList
        findings={findings}
        loading={!reviews && !isError}
        repoFullName={repoFullName}
        headSha={pr.head_sha}
      />
    </HoverCard>
  );
}
