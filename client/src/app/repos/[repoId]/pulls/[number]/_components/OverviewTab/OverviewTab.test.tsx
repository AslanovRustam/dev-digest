/* OverviewTab — block order with a stored brief, Regenerate, and Intent/Blast still rendering when the
   brief fails to load. fetch is mocked by URL + method. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import intentMessages from "../../../../../../../../messages/en/intent.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const brief: PrBrief = {
  summary: "Adds rate limiting.",
  risks: [{ kind: "auth", title: "Auth surface touched", explanation: "e", severity: "high", file_refs: [] }],
  review_focus: [{ file: "src/config.ts", line: 12, reason: "live key committed" }],
  history: [],
  head_sha: "abcdef1234",
  generated_at: "2026-01-01T00:00:00.000Z",
  provider: "openrouter",
  model: "deepseek/v4",
  tokens_in: 1,
  tokens_out: 1,
  attempts: 1,
  inputs: [],
};
const stored = (b: PrBrief): PrBriefResponse => ({ brief: b, pr_head_sha: "abcdef1234", stale: false, stale_reasons: [] });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mockFetch(briefGet: () => Response, briefPost?: () => Response) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    if (u.endsWith("/brief")) return method === "POST" && briefPost ? briefPost() : briefGet();
    if (u.endsWith("/intent")) return json({ intent: null, pr_head_sha: "abcdef1234", stale: false });
    if (u.endsWith("/blast"))
      return json({
        changed_symbols: [],
        downstream: [],
        summary: "",
        stats: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
        degraded: false,
        reason: null,
        indexed_sha: null,
      });
    return json([]);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ brief: briefMessages, intent: intentMessages, blast: blastMessages }}
      >
        <OverviewTab prBody="PR body text" prId="p1" repoFullName="o/r" headSha="abcdef1234" onOpenInDiff={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("OverviewTab", () => {
  it("orders PR Brief, Intent + Risk areas, Blast radius, Review focus, Description", async () => {
    mockFetch(() => json(stored(brief)));
    renderTab();

    await screen.findByText("Adds rate limiting.");
    const order = [
      screen.getByRole("region", { name: "PR Brief" }),
      await screen.findByText("Intent"),
      screen.getByRole("region", { name: "Risk areas" }),
      await screen.findByText("Blast radius"),
      screen.getByRole("region", { name: "Review focus — read these first" }),
      screen.getByText("Description"),
    ];
    order.slice(1).forEach((el, i) => {
      expect(order[i]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it("Regenerate posts and the card shows the new summary", async () => {
    const fn = mockFetch(
      () => json(stored(brief)),
      () => json(stored({ ...brief, summary: "Fresh summary." })),
    );
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Regenerate brief" }));
    expect(await screen.findByText("Fresh summary.")).toBeInTheDocument();
    expect(fn.mock.calls.some(([u, i]) => String(u).endsWith("/brief") && i?.method === "POST")).toBe(true);
  });

  it("still renders Intent and Blast radius when the brief fails to load", async () => {
    mockFetch(() => json({ error: { code: "internal", message: "boom" } }, 500));
    renderTab();

    expect(await screen.findByText("Could not load the brief.")).toBeInTheDocument();
    expect(await screen.findByText("Intent")).toBeInTheDocument();
    expect(await screen.findByText("Blast radius")).toBeInTheDocument();
  });
});
