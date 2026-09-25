import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { finding } from "@/test/findings-fixture";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  finding({ title: "Hardcoded secret", severity: "CRITICAL", confidence: 0.95 }),
  finding({ title: "N+1 query", severity: "WARNING", category: "perf", confidence: 0.86 }),
  finding({ title: "Maybe rename", severity: "SUGGESTION", category: "style", confidence: 0.4 }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel", () => {
  it("renders every finding card; the filters live in SeverityFilterBar now", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Maybe rename")).toBeInTheDocument();
    expect(screen.queryByText("Hide low confidence")).not.toBeInTheDocument();
  });

  it("shows only the selected severity", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" severity="WARNING" />);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Maybe rename")).not.toBeInTheDocument();
  });

  it("hides low-confidence findings when asked", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" hideLow />);
    expect(screen.queryByText("Maybe rename")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS.slice(0, 1)} prId="pr1" severity="SUGGESTION" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});
