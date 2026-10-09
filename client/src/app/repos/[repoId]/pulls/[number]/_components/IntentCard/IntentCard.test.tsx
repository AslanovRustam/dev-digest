/* IntentCard — empty state, rendered intent (scope, risk chips, sources, missing line),
   stale badge, and Re-derive POSTing then re-rendering. fetch is mocked. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/intent.json";
import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const record: PrIntentRecord = {
  pr_id: "p1",
  intent: "Adds Redis-backed rate limiting.",
  in_scope: ["rate limiter"],
  out_of_scope: ["auth"],
  confidence: "medium",
  sources: [
    { kind: "issue", ref: "#12", status: "used", reason: null, chars: 100, truncated: false },
    {
      kind: "plan",
      ref: "specs/x.md",
      status: "unreachable",
      reason: "not found at head abc1234",
      chars: null,
      truncated: false,
    },
  ],
  missing_context: ["specs/x.md: not found at head abc1234"],
  risk_areas: [
    { kind: "dependency", label: "New dependency: ioredis", origin: "code" },
    { kind: "auth", label: "Auth surface touched", origin: "model" },
  ],
  head_sha: "abc1234def",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0.001,
  duration_ms: 10,
  derived_at: "2026-01-01T00:00:00.000Z",
};

function mockFetch(handler: (method: string) => PrIntentResponse) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = handler(init?.method ?? "GET");
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
        <IntentCard prId="p1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("IntentCard", () => {
  it("shows the empty state with a Derive button", async () => {
    mockFetch(() => ({ intent: null, pr_head_sha: "abc1234def", stale: false }));
    renderCard();
    expect(await screen.findByText("No intent derived yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Derive intent/ })).toBeInTheDocument();
  });

  it("renders summary, scopes, risk chips, sources and the missing-context line", async () => {
    mockFetch(() => ({ intent: record, pr_head_sha: "abc1234def", stale: false }));
    renderCard();
    expect(await screen.findByText("Adds Redis-backed rate limiting.")).toBeInTheDocument();
    expect(screen.getByText("medium confidence")).toBeInTheDocument();
    expect(screen.getByText("rate limiter")).toBeInTheDocument();
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByText("unreachable")).toBeInTheDocument();
    expect(screen.getAllByText("specs/x.md: not found at head abc1234").length).toBeGreaterThan(0);
    expect(screen.getByText(/derived from abc1234/)).toBeInTheDocument();
    expect(screen.queryByText(/Stale/)).not.toBeInTheDocument();
  });

  it("hides the risk row when there are none and shows the stale badge when stale", async () => {
    mockFetch(() => ({ intent: { ...record, risk_areas: [] }, pr_head_sha: "ffff", stale: true }));
    renderCard();
    expect(await screen.findByText(/Stale/)).toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
  });

  it("Re-derive POSTs and re-renders with the new intent", async () => {
    const fn = mockFetch((method) => ({
      intent: method === "POST" ? { ...record, intent: "Fresh summary." } : record,
      pr_head_sha: "abc1234def",
      stale: false,
    }));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /Re-derive intent/ }));
    expect(await screen.findByText("Fresh summary.")).toBeInTheDocument();
    await waitFor(() => expect(fn.mock.calls.some((c) => c[1]?.method === "POST")).toBe(true));
  });
});
