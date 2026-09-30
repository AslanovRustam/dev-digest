/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { finding } from "@/test/findings-fixture";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0013,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — run cost (L01)", () => {
  it("a settled run shows cost · tokens under its time", () => {
    renderRuns([run({ status: "done", cost_usd: 0.0013, tokens_in: 8200, tokens_out: 919 })]);
    expect(screen.getByTestId("run-cost")).toHaveTextContent("$0.0013 · 8.2K→919");
  });

  it("a settled run with unknown cost shows a dash, not $0.00", () => {
    renderRuns([run({ status: "done", cost_usd: null })]);
    expect(screen.getByTestId("run-cost")).toHaveTextContent(/^— · 100→50$/);
  });

  it("failed and running runs show no price", () => {
    renderRuns([
      run({ run_id: "f", status: "failed", error: "429 quota", cost_usd: null, tokens_in: 0, tokens_out: 0 }),
      run({ run_id: "r", status: "running", cost_usd: null }),
    ]);
    expect(screen.queryByTestId("run-cost")).not.toBeInTheDocument();
  });
});

describe("RunHistory — findings preview (L01)", () => {
  afterEach(() => vi.useRealTimers());

  const FINDINGS: FindingRecord[] = [
    finding({ title: "Hardcoded Stripe secret key in commit", severity: "CRITICAL" }),
    finding({ title: "Lethal trifecta: untrusted input reaches exfil path", severity: "CRITICAL" }),
    finding({ title: "Retry-After header omitted on 429", severity: "WARNING", category: "bug" }),
  ];

  function renderWithFindings(findingsByRun: Map<string, FindingRecord[]>, onGoToReview = vi.fn()) {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunHistory
          runs={[run({ status: "done", findings_count: 3, blockers: 2, score: 38 })]}
          onOpenTrace={() => {}}
          onGoToReview={onGoToReview}
          findingsByRun={findingsByRun}
        />
      </NextIntlClientProvider>,
    );
    return onGoToReview;
  }

  it("replaces the plain count with per-severity counts; blockers keep their text", () => {
    renderWithFindings(new Map([["run-1", FINDINGS]]));
    expect(screen.getByTestId("severity-tally")).toHaveAccessibleName("2 critical, 1 warning");
    expect(screen.queryByText(/3 finding\(s\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("previews the run's findings on hover", () => {
    vi.useFakeTimers();
    renderWithFindings(new Map([["run-1", FINDINGS]]));
    fireEvent.mouseEnter(screen.getByTestId("severity-tally"));
    act(() => void vi.advanceTimersByTime(200));
    const card = screen.getByRole("tooltip");
    expect(card).toHaveTextContent("3 findings");
    expect(card).toHaveTextContent("Retry-After header omitted on 429");
  });

  it("clicking the counts jumps to the run's review", () => {
    const onGoToReview = renderWithFindings(new Map([["run-1", FINDINGS]]));
    fireEvent.click(screen.getByRole("button", { name: /2 critical, 1 warning/ }));
    expect(onGoToReview).toHaveBeenCalledWith("run-1");
  });

  it("falls back to the plain count when the run's review is not loaded", () => {
    renderWithFindings(new Map());
    expect(screen.getByText(/3 finding\(s\)/)).toBeInTheDocument();
    expect(screen.queryByTestId("severity-tally")).not.toBeInTheDocument();
  });
});
