/* DiffTab — Smart Diff grouping: role headers in order, collapsed groups, order toggle.
   fetch is mocked by URL. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";
import { parseFocusLine } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PATCH = "@@ -1,1 +1,2 @@\n a\n+b";
const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: PATCH });
// GitHub order: lockfile first, core last
const files = [
  file("pnpm-lock.yaml"),
  file("README.md"),
  file("src/a.test.ts"),
  file("src/index.ts"),
  file("src/core.ts"),
];

const entry = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const smartDiff: SmartDiff = {
  groups: [
    { role: "core", files: [entry("src/core.ts")] },
    { role: "tests", files: [entry("src/a.test.ts")] },
    { role: "wiring", files: [entry("src/index.ts")] },
    { role: "docs", files: [entry("README.md")] },
    { role: "boilerplate", files: [entry("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 5, proposed_splits: [] },
};

function mockFetch(reviews: ReviewRecord[] = [], opts: { commentsDelayMs?: number; onCommentsServed?: () => void } = {}) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    const u = String(url);
    if (opts.commentsDelayMs && u.includes("/comments")) {
      await new Promise((r) => setTimeout(r, opts.commentsDelayMs));
      opts.onCommentsServed?.();
    }
    const body = u.includes("/smart-diff") ? smartDiff : u.includes("/reviews") ? reviews : [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderTab(focus?: { path: string; line: number | null }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={files.length} files={files} focus={focus} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("DiffTab smart grouping", () => {
  it("renders role headers in order and keeps low-signal groups collapsed", async () => {
    mockFetch();
    renderTab();

    await screen.findByRole("button", { name: /^Core/ });
    const headers = screen
      .getAllByRole("button", { expanded: undefined })
      .filter((b) => b.hasAttribute("aria-expanded"))
      .map((b) => b.textContent ?? "");
    const expected = [
      ["Core logic", "The substance of the change — review closely"],
      ["Tests", "Proves the change works — check what it covers"],
      ["Wiring", "Hooks the core into the app"],
      ["Docs", "Explains the change — read for intent"],
      ["Boilerplate", "Generated / mechanical — skim"],
    ];
    expect(headers).toHaveLength(expected.length);
    // Each header reads: label, role hint, then the file count.
    headers.forEach((h, i) => expect(h).toMatch(new RegExp(`^${expected[i]![0]}${expected[i]![1]}\\d+ files?$`)));

    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Boilerplate/ }));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("'Original order' shows the files flat in input order", async () => {
    mockFetch();
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Original order" }));
    const paths = screen.getAllByText(/\.(ts|md|yaml)$/).map((n) => n.textContent);
    expect(paths).toEqual(files.map((f) => f.path));
    expect(screen.queryByRole("button", { name: /^Core/ })).not.toBeInTheDocument();
    const group = screen.getByRole("group", { name: "File order" });
    expect(within(group).getByRole("button", { name: "Original order" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("DiffTab deep link focus", () => {
  const scroll = vi.fn();
  beforeEach(() => {
    scroll.mockReset();
    Element.prototype.scrollIntoView = scroll;
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
  });

  it("opens the collapsed group holding the file and scrolls to + highlights the line", async () => {
    mockFetch();
    renderTab({ path: "README.md", line: 2 });

    await screen.findByRole("button", { name: /^Docs/ });
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    const row = scroll.mock.contexts.at(-1) as HTMLElement;
    expect(row.getAttribute("data-new-line")).toBe("2");
    await waitFor(() => expect(row.firstElementChild).toHaveStyle({ boxShadow: "inset 0 0 0 2px var(--accent)" }));
  });

  it("scrolls the card when no line is given", async () => {
    mockFetch();
    renderTab({ path: "src/core.ts", line: null });

    await screen.findByRole("button", { name: /^Core/ });
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect((scroll.mock.contexts.at(-1) as HTMLElement).hasAttribute("data-new-line")).toBe(false);
  });

  it("scrolls once, after the role groups are in place; re-expanding the card does not scroll again", async () => {
    mockFetch();
    renderTab({ path: "src/core.ts", line: 2 });

    // Waits for smart-diff, so the one scroll lands on the role-group row (never on the flat list first).
    await screen.findByRole("button", { name: /^Core/ });
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    const row = scroll.mock.contexts.at(-1) as HTMLElement;
    expect(row.getAttribute("data-new-line")).toBe("2");
    await new Promise((r) => setTimeout(r, 20));
    expect(scroll).toHaveBeenCalledTimes(1);

    const header = screen.getByText("src/core.ts");
    const open = screen.getAllByText("b").length;
    fireEvent.click(header);
    expect(screen.getAllByText("b")).toHaveLength(open - 1);
    fireEvent.click(header);
    expect(screen.getAllByText("b")).toHaveLength(open);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("waits for comments to arrive, then scrolls once", async () => {
    let served = false;
    const servedAtScroll: boolean[] = [];
    scroll.mockImplementation(() => servedAtScroll.push(served));
    mockFetch([], { commentsDelayMs: 60, onCommentsServed: () => (served = true) });
    renderTab({ path: "src/core.ts", line: 2 });

    await waitFor(() => expect(scroll).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(servedAtScroll).toEqual([true]);
  });

  it("a focus change while mounted opens the collapsed group, scrolls to the row and flashes it", async () => {
    mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (focus: { path: string; line: number | null }) => (
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
          <DiffTab prId="p1" filesCount={files.length} files={files} focus={focus} />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const view = render(tree({ path: "src/core.ts", line: 2 }));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));

    view.rerender(tree({ path: "README.md", line: 2 }));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
    const row = scroll.mock.contexts.at(-1) as HTMLElement;
    expect(row.getAttribute("data-new-line")).toBe("2");
    await waitFor(() => expect(row.firstElementChild).toHaveStyle({ boxShadow: "inset 0 0 0 2px var(--accent)" }));
  });

  it("an unparsable ?line= reaches the viewer as line null: card opens and scrolls, no row is highlighted", async () => {
    mockFetch();
    renderTab({ path: "src/core.ts", line: parseFocusLine("abc") });

    await screen.findByRole("button", { name: /^Core/ });
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect((scroll.mock.contexts.at(-1) as HTMLElement).hasAttribute("data-new-line")).toBe(false);
    expect(screen.getAllByText("b").length).toBeGreaterThan(0);
    expect(document.querySelector("[style*='inset 0 0 0 2px']")).toBeNull();
  });

  it("says so when the file is not in this PR's diff", async () => {
    mockFetch();
    renderTab({ path: "nope/missing.ts", line: 3 });

    expect(await screen.findByText(/File not in this PR's diff/)).toBeInTheDocument();
    expect(scroll).not.toHaveBeenCalled();
  });
});

const finding = (id: string, file: string, start_line: number, title: string, severity = "CRITICAL"): FindingRecord =>
  ({
    id,
    severity,
    category: "bug",
    title,
    file,
    start_line,
    end_line: start_line,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  }) as FindingRecord;

const review = (findings: FindingRecord[]): ReviewRecord =>
  ({
    id: "r1",
    pr_id: "p1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings,
  }) as ReviewRecord;

const reviews = [
  review([
    finding("f1", "src/core.ts", 2, "Null deref on line two"),
    finding("f2", "src/core.ts", 50, "Outside the patch"),
    finding("f3", "src/a.test.ts", 2, "Weak assertion", "WARNING"),
  ]),
];

describe("DiffTab findings in the diff", () => {
  it("shows the group counter, inline findings, line label and the not-in-diff block", async () => {
    mockFetch(reviews);
    renderTab();

    const core = await screen.findByRole("button", { name: /^Core.*1 file with findings/ });
    expect(core).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tests.*1 file with findings/ })).toBeInTheDocument();
    expect(screen.getByText("Null deref on line two")).toBeInTheDocument();
    expect(screen.getAllByText("blocker").length).toBeGreaterThan(0);
    expect(screen.getByText("Not on a changed line")).toBeInTheDocument();
    expect(screen.getByText("Outside the patch")).toBeInTheDocument();
    expect(screen.queryByText(/Review not run yet/)).not.toBeInTheDocument();
  });

  it("says the review has not run when there is no review", async () => {
    mockFetch([]);
    renderTab();
    // Exact strings: a cp1252 byte for `—` / `·` once reached the UI as U+FFFD while regex checks passed.
    expect(
      await screen.findByText("Review not run yet — findings will appear in the diff after Run review"),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Files changed · \d+ files$/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /with findings/ })).not.toBeInTheDocument();
  });

  it("'Hide comments' removes the finding bodies but keeps the line label", async () => {
    mockFetch(reviews);
    renderTab();

    await screen.findByText("Null deref on line two");
    fireEvent.click(screen.getByRole("button", { name: /^Hide comments/ }));
    expect(screen.queryByText("Null deref on line two")).not.toBeInTheDocument();
    expect(screen.queryByText("Outside the patch")).not.toBeInTheDocument();
    expect(screen.getAllByText("blocker").length).toBeGreaterThan(0);
  });

  it("Accept posts to /findings/<id>/accept", async () => {
    const fn = mockFetch(reviews);
    renderTab();

    await screen.findByText("Null deref on line two");
    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]!);
    await waitFor(() => {
      const posted = fn.mock.calls.some(
        ([url, init]) => /\/findings\/f1\/accept$/.test(String(url)) && (init as RequestInit | undefined)?.method === "POST",
      );
      expect(posted).toBe(true);
    });
  });
});
