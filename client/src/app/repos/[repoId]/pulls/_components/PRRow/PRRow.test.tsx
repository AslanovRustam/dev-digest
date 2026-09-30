/** PRRow — the list's COST and FINDINGS cells (L01). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { finding } from "@/test/findings-fixture";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// The findings preview loads reviews lazily; record every call's `enabled` flag.
const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string, enabled: boolean) => usePrReviews(prId, enabled),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  usePrReviews.mockReset();
  push.mockReset();
});

const PR: PrMeta = {
  id: "pr-1",
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "marisa.koch",
  branch: "feat/rate-limit-public",
  base: "main",
  head_sha: "a1b2c3d",
  additions: 247,
  deletions: 38,
  files_count: 9,
  status: "needs_review",
  opened_at: null,
  updated_at: null,
  score: 61,
};

function review(id: string, findings: ReviewRecord["findings"]): ReviewRecord {
  return {
    id,
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: `run-${id}`,
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 61,
    model: null,
    created_at: "2026-09-25T10:00:00Z",
    findings,
  };
}

function renderRow(pr: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={pr} repoId="repo-1" repoFullName="acme/payments-api" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the latest review's cost compactly", () => {
    usePrReviews.mockReturnValue({ data: undefined, isError: false });
    renderRow({ ...PR, cost_usd: 0.014 });
    expect(screen.getByTestId("run-cost")).toHaveTextContent(/^\$0\.014$/);
  });

  it("shows a dash when the cost is unknown (never reviewed / running / unpriced)", () => {
    usePrReviews.mockReturnValue({ data: undefined, isError: false });
    renderRow({ ...PR, cost_usd: null });
    expect(screen.getByTestId("run-cost")).toHaveTextContent("—");
  });
});

describe("PRRow — findings cell", () => {
  it("shows a dash for a never-reviewed PR", () => {
    usePrReviews.mockReturnValue({ data: undefined, isError: false });
    renderRow({ ...PR, score: null, findings: null, cost_usd: 0.01, updated_at: "2026-09-25T10:00:00Z" });
    expect(screen.queryByTestId("severity-tally")).not.toBeInTheDocument();
    expect(screen.queryByText("No findings")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2); // score + findings
  });

  it("says 'No findings' when the latest review found nothing open", () => {
    usePrReviews.mockReturnValue({ data: undefined, isError: false });
    renderRow({ ...PR, findings: { critical: 0, warning: 0, suggestion: 0 } });
    expect(screen.getByText("No findings")).toBeInTheDocument();
  });

  it("shows per-severity counts and fetches nothing until hovered", () => {
    usePrReviews.mockReturnValue({ data: undefined, isError: false });
    renderRow({ ...PR, findings: { critical: 2, warning: 2, suggestion: 2 } });
    expect(screen.getByTestId("severity-tally")).toHaveAccessibleName("2 critical, 2 warning, 2 suggestion");
    expect(usePrReviews).toHaveBeenCalled();
    expect(usePrReviews.mock.calls.every(([, enabled]) => enabled === false)).toBe(true);
  });

  it("on hover previews the open findings of every review, without navigating", () => {
    vi.useFakeTimers();
    usePrReviews.mockImplementation((_id: string, enabled: boolean) => ({
      data: enabled
        ? [
            review("rv1", [
              finding({ title: "Hardcoded Stripe secret key in commit" }),
              finding({ title: "Dismissed one", dismissed_at: "2026-09-25T11:00:00Z" }),
            ]),
            review("rv-old", [finding({ title: "From an older review", severity: "WARNING" })]),
            { ...review("rv-sum", [finding({ title: "From a summary" })]), kind: "summary" as const },
          ]
        : undefined,
      isError: false,
    }));
    renderRow({ ...PR, findings: { critical: 1, warning: 1, suggestion: 0 } });

    const tally = screen.getByTestId("severity-tally");
    fireEvent.mouseEnter(tally);
    act(() => void vi.advanceTimersByTime(200));

    const card = screen.getByRole("tooltip");
    expect(card).toHaveTextContent("2 findings");
    expect(card).toHaveTextContent("Hardcoded Stripe secret key in commit");
    expect(card).toHaveTextContent("From an older review");
    expect(card).not.toHaveTextContent("Dismissed one");
    expect(card).not.toHaveTextContent("From a summary");

    fireEvent.click(tally);
    fireEvent.click(card);
    expect(push).not.toHaveBeenCalled();
  });
});
