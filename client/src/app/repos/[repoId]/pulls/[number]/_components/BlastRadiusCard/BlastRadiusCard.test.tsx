/* BlastRadiusCard — summary, tree open/close, link shas, chips, empty / degraded / error states.
   fetch is mocked. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base: BlastRadiusResponse = {
  changed_symbols: [
    { name: "runReview", file: "src/a.ts", kind: "function" },
    { name: "Planner", file: "src/b.ts", kind: "class" },
  ],
  downstream: [
    {
      symbol: "runReview",
      callers: [
        { name: "handler", file: "src/a.ts", line: 23 },
        { name: "cron", file: "src/c.ts", line: 5 },
      ],
      endpoints_affected: ["POST /reviews"],
      crons_affected: ["nightly-sync"],
    },
    {
      symbol: "Planner",
      callers: [{ name: "build", file: "src/d.ts", line: 9 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "2 changed symbols, 3 callers, 1 endpoint, 1 cron",
  stats: { symbols: 2, callers: 3, endpoints: 1, crons: 1 },
  degraded: false,
  reason: null,
  indexed_sha: "idxsha",
};

function mockFetch(body: BlastRadiusResponse | null, status = 200) {
  const fn = vi.fn(async () => {
    return new Response(JSON.stringify(body ?? { error: "boom" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderCard(repoFullName: string | null = "acme/api") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard prId="p1" repoFullName={repoFullName} headSha="headsha" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("shows the summary numbers", async () => {
    mockFetch(base);
    renderCard();
    await screen.findByText("Blast radius");
    expect(screen.getByText("symbols").textContent).toBe("2symbols");
    expect(screen.getByText("callers").textContent).toBe("3callers");
    expect(screen.getByText("endpoints").textContent).toBe("1endpoints");
    expect(screen.getByText("cron/jobs").textContent).toBe("1cron/jobs");
  });

  it("opens the first symbol, keeps the second closed, and opens it on click", async () => {
    mockFetch(base);
    renderCard();
    const first = await screen.findByRole("button", { name: /runReview\(\)/ });
    const second = screen.getByRole("button", { name: /Planner/ });
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(second.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("src/d.ts:9")).toBeNull();
    fireEvent.click(second);
    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("src/d.ts:9")).toBeTruthy();
  });

  it("links callers at the indexed sha", async () => {
    mockFetch(base);
    renderCard();
    const link = await screen.findByText("src/a.ts:23");
    expect(link.closest("a")?.getAttribute("href")).toBe("https://github.com/acme/api/blob/idxsha/src/a.ts#L23");
  });

  it("falls back to the head sha when indexed_sha is null", async () => {
    mockFetch({ ...base, indexed_sha: null });
    renderCard();
    const link = await screen.findByText("src/a.ts:23");
    expect(link.closest("a")?.getAttribute("href")).toBe("https://github.com/acme/api/blob/headsha/src/a.ts#L23");
  });

  it("renders plain text when the repo name is unknown", async () => {
    mockFetch(base);
    renderCard(null);
    const el = await screen.findByText("src/a.ts:23");
    expect(el.closest("a")).toBeNull();
  });

  it("renders endpoint and cron chips", async () => {
    mockFetch(base);
    renderCard();
    expect(await screen.findByText("POST /reviews")).toBeTruthy();
    expect(screen.getByText("nightly-sync")).toBeTruthy();
  });

  it("shows the no-callers text when downstream is empty", async () => {
    mockFetch({ ...base, downstream: [], stats: { symbols: 2, callers: 0, endpoints: 0, crons: 0 } });
    renderCard();
    expect(await screen.findByText("2 changed symbol(s), no downstream callers found.")).toBeTruthy();
  });

  it("shows the degraded badge and reason with data present", async () => {
    mockFetch({ ...base, degraded: true, reason: "index_partial" });
    renderCard();
    expect(await screen.findByText("Index incomplete")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("The repo index is partial — some callers may be missing.");
    expect(screen.getByText("src/a.ts:23")).toBeTruthy();
  });

  it("shows the degraded badge and reason without data", async () => {
    mockFetch({
      ...base,
      downstream: [],
      degraded: true,
      reason: "no_data",
      indexed_sha: null,
      stats: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    });
    renderCard();
    expect(await screen.findByText("Index incomplete")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("No repo index for these files yet");
  });

  it("switches to the graph view and back to the tree", async () => {
    mockFetch(base);
    renderCard();
    const graphBtn = await screen.findByRole("button", { name: "graph" });
    const treeBtn = screen.getByRole("button", { name: "tree" });
    expect(treeBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();

    fireEvent.click(graphBtn);
    const svg = screen.getByRole("img", { name: "Blast radius graph" });
    expect(graphBtn.getAttribute("aria-pressed")).toBe("true");
    expect(svg.textContent).toContain("runReview");
    expect(svg.textContent).toContain("handler");
    expect(svg.textContent).toContain("POST /reviews");
    expect(screen.queryByText("src/a.ts:23")).toBeNull();

    fireEvent.click(treeBtn);
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();
    expect(screen.getByText("src/a.ts:23")).toBeTruthy();
  });

  it("shows an alert when loading fails", async () => {
    mockFetch(null, 500);
    renderCard();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Couldn't load the blast radius.");
  });
});
