/* ConventionsHeader — "Conventions in <repo>", what the last scan sampled and
   what the evidence gate dropped, and the Re-scan button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { ConventionScan } from "@devdigest/shared";
import { compactAge } from "../../helpers";
import { s } from "./styles";

export function ConventionsHeader({
  repoName,
  scan,
  scanning,
  showRescan,
  onRescan,
}: {
  repoName: string;
  scan: ConventionScan | null;
  scanning: boolean;
  /** False on the empty state, which has its own "Run extraction" CTA. */
  showRescan: boolean;
  onRescan: () => void;
}) {
  const t = useTranslations("conventions");

  const subtitle = (): string => {
    if (scanning) return t("page.scanningHint");
    if (!scan) return t("page.subtitle");
    const age = compactAge(scan.created_at);
    return t("page.scanSummary", {
      files: scan.sample_files.length,
      age: age ? t("page.ago", { age }) : t("page.justNow"),
    });
  };

  return (
    <div style={s.header}>
      <div style={s.headerText}>
        <h1 style={s.title}>
          {t("page.headingPrefix")}
          <span className="mono" style={s.repo}>
            {repoName}
          </span>
        </h1>
        <p style={s.subtitle}>{subtitle()}</p>
        {scan && !scanning && (
          <p style={s.gate}>
            {t("page.scanGate", {
              proposed: scan.proposed,
              dropped: scan.dropped_ungrounded,
              duplicates: scan.dropped_duplicate,
            })}
          </p>
        )}
      </div>
      {showRescan && (
        <Button icon="RefreshCw" onClick={onRescan} loading={scanning}>
          {scanning ? t("page.scanning") : t("page.rescan")}
        </Button>
      )}
    </div>
  );
}

export default ConventionsHeader;
