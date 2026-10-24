"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
      {prId && (
        <div style={s.briefGrid}>
          <IntentCard prId={prId} />
          <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      )}
    </>
  );
}
