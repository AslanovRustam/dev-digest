/* PrBriefCard + RiskAreas + ReviewFocus — states, pinned texts, inert model text. Props are plain; no fetch. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, PrBriefResponse, ReviewRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../messages/en/brief.json";
import { PrBriefCard, RiskAreas, ReviewFocus, type PrBriefCardProps } from "./index";

afterEach(cleanup);

const brief: PrBrief = {
  summary: "Adds rate limiting.",
  risks: [
    {
      kind: "auth",
      title: "Auth surface touched",
      explanation: "Middleware runs before auth.",
      severity: "high",
      file_refs: ["src/mw.ts:12-18", "package.json"],
    },
    { kind: "x", title: "Minor", explanation: "e2", severity: "low", file_refs: [] },
  ],
  review_focus: [
    { file: "src/config.ts", line: 12, reason: "live key committed" },
    { file: "src/api.ts", line: 61, reason: "forwards token" },
  ],
  history: [],
  head_sha: "abcdef1234",
  generated_at: "2026-01-01T00:00:00.000Z",
  provider: "openrouter",
  model: "deepseek/v4",
  tokens_in: 8200,
  tokens_out: 1300,
  attempts: 1,
  inputs: [
    { source: "diff", status: "used", tokens: 100 },
    { source: "intent", status: "missing", tokens: 0, reason: "not_derived" },
  ],
};

const review = {
  verdict: "request_changes",
  score: 61,
  findings: [
    { severity: "CRITICAL", dismissed_at: null },
    { severity: "WARNING", dismissed_at: null },
  ],
} as unknown as ReviewRecord;

const response = (over: Partial<PrBriefResponse> = {}): PrBriefResponse => ({
  brief,
  pr_head_sha: "abcdef1234",
  stale: false,
  stale_reasons: [],
  ...over,
});

function setup(p: {
  data?: PrBriefResponse;
  isLoading?: boolean;
  error?: Error | null;
  pending?: boolean;
  genError?: Error | null;
  review?: ReviewRecord | null;
  b?: PrBrief | null;
}) {
  const mutate = vi.fn();
  const refetch = vi.fn();
  const onOpenInDiff = vi.fn();
  const props: PrBriefCardProps = {
    brief: { data: p.data, isLoading: p.isLoading ?? false, error: p.error ?? null, refetch },
    generate: { isPending: p.pending ?? false, error: p.genError ?? null, mutate },
    review: p.review ?? null,
  };
  const b = p.data?.brief ?? null;
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefCard {...props} />
      {b && <RiskAreas risks={b.risks} onOpenInDiff={onOpenInDiff} />}
      {b && <ReviewFocus items={b.review_focus} onOpenInDiff={onOpenInDiff} />}
    </NextIntlClientProvider>,
  );
  return { mutate, refetch, onOpenInDiff };
}

describe("PrBriefCard", () => {
  it("offers Generate when no brief exists and calls generate", () => {
    const { mutate } = setup({ data: response({ brief: null }) });
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton and a disabled button while generating", () => {
    setup({ data: response(), pending: true });
    expect(screen.getByRole("status", { name: "Generating brief…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate brief/ })).toBeDisabled();
    expect(screen.queryByText("Adds rate limiting.")).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    setup({ isLoading: true });
    expect(screen.getByRole("status", { name: "Loading brief…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
  });

  it("renders summary, provenance, verdict line and Generated without", () => {
    setup({ data: response(), review });
    expect(screen.getByText("Adds rate limiting.")).toBeInTheDocument();
    expect(screen.getByText("Generated from abcdef1 · deepseek/v4 · — · 8200→1300 tokens")).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("2 findings · 1 blockers")).toBeInTheDocument();
    expect(screen.getByText("Generated without: intent (not derived yet)")).toBeInTheDocument();
  });

  it("shows '0 blockers' when no finding blocks", () => {
    const calm = {
      ...review,
      findings: [1, 2, 3].map(() => ({ severity: "WARNING", dismissed_at: null })),
    } as unknown as ReviewRecord;
    setup({ data: response(), review: calm });
    expect(screen.getByText("3 findings · 0 blockers")).toBeInTheDocument();
  });

  it("prints the cost when known", () => {
    setup({ data: response({ brief: { ...brief, cost_usd: 0.0144 } }) });
    expect(screen.getByText(/· \$0\.014 ·/)).toBeInTheDocument();
  });

  it("shows Stale with both reasons", () => {
    setup({
      data: response({ stale: true, pr_head_sha: "9999999zzz", stale_reasons: ["new_commit", "new_review"] }),
    });
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("Generated for abcdef1, PR is at 9999999")).toBeInTheDocument();
    expect(screen.getByText("A newer review exists")).toBeInTheDocument();
  });

  it("maps errors to the pinned messages and keeps the old brief", () => {
    setup({ data: response(), genError: new ApiError("x", 409, "brief_in_progress") });
    expect(screen.getByRole("alert")).toHaveTextContent("A brief is already being generated — refresh in a moment");
    expect(screen.getByText("Adds rate limiting.")).toBeInTheDocument();
  });

  it("names the provider for a missing key and links to Settings", () => {
    setup({ data: response(), genError: new ApiError("x", 500, "config_error", { provider: "openrouter" }) });
    expect(screen.getByRole("alert")).toHaveTextContent("No API key for openrouter. Add one in Settings.");
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
  });

  it("offers Retry on a generic failure and on a load failure", () => {
    const a = setup({ data: response(), genError: new ApiError("boom", 502, "brief_generation_failed") });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not generate the brief: boom");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(a.mutate).toHaveBeenCalledTimes(1);
    cleanup();
    const b = setup({ error: new ApiError("down", 500) });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the brief.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(b.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows 'Pull request not found' for a 404", () => {
    setup({ error: new ApiError("nf", 404, "not_found") });
    expect(screen.getByRole("alert")).toHaveTextContent("Pull request not found");
  });

  it("renders model text as inert plain text", () => {
    const evil = "<script>alert(1)</script> [x](http://e)";
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <PrBriefCard
          brief={{ data: response({ brief: { ...brief, summary: evil } }), isLoading: false, error: null, refetch: vi.fn() }}
          generate={{ isPending: false, error: null, mutate: vi.fn() }}
          review={null}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a[href='http://e']")).toBeNull();
  });
});

describe("RiskAreas", () => {
  it("shows title, severity text and refs; expands the explanation; opens refs in the diff", () => {
    const { onOpenInDiff } = setup({ data: response() });
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.queryByText("Middleware runs before auth.")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show explanation: Auth surface touched" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText("Middleware runs before auth.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide explanation: Auth surface touched" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open src/mw.ts:12-18 in Files changed" }));
    expect(onOpenInDiff).toHaveBeenLastCalledWith("src/mw.ts", 12);
    fireEvent.click(screen.getByRole("button", { name: "Open package.json in Files changed" }));
    expect(onOpenInDiff).toHaveBeenLastCalledWith("package.json", null);
  });

  it("says so when there are no risks", () => {
    setup({ data: response({ brief: { ...brief, risks: [] } }) });
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});

describe("ReviewFocus", () => {
  it("lists file:line — reason rows in order with a count badge", () => {
    const { onOpenInDiff } = setup({ data: response() });
    const rows = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("—"));
    expect(rows.map((r) => r.textContent)).toEqual([
      "src/config.ts:12— live key committed",
      "src/api.ts:61— forwards token",
    ]);
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Review focus — read these first" });
    expect(within(section).getByText(String(brief.review_focus.length))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open src/api.ts:61 in Files changed" }));
    expect(onOpenInDiff).toHaveBeenCalledWith("src/api.ts", 61);
  });

  it("says so when there are no focus lines", () => {
    setup({ data: response({ brief: { ...brief, review_focus: [] } }) });
    expect(screen.getByText("No focus lines suggested.")).toBeInTheDocument();
  });
});
