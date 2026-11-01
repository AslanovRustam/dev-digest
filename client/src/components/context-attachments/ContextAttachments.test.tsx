import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachments as View, ContextDocSummary } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";

vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocument: (_repo: string, path: string) => ({
    data: { path, type: "specs", text: "# Security baseline\n\n<img src=x onerror=alert(1)>", tokens: 317, version: "v", used_by_agents: 1 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ContextAttachments, type ContextRepoState } from "./ContextAttachments";

const doc = (path: string, type: ContextDocSummary["type"]): ContextDocSummary => ({
  path,
  type,
  tokens: 100,
  too_large: false,
  used_by_agents: 0,
});
const DOCS = [
  doc("specs/security-baseline.md", "specs"),
  doc("specs/public-api.md", "specs"),
  doc("docs/architecture.md", "docs"),
  doc("insights/perf-budget.md", "insights"),
];
const VIEW: View = {
  items: [
    { path: "specs/security-baseline.md", via_skill: null, status: "present", tokens: 200, truncated: false, dropped: false },
    { path: "specs/public-api.md", via_skill: null, status: "present", tokens: 117, truncated: true, dropped: false },
    { path: "specs/gone.md", via_skill: null, status: "not_in_repo", tokens: null, truncated: false, dropped: false },
    { path: "insights/perf-budget.md", via_skill: "pr-quality-rubric", status: "present", tokens: 50, truncated: false, dropped: false },
  ],
  total_tokens: 367,
  requested_tokens: 367,
  budget: 24000,
};

afterEach(cleanup);

function renderTab(props: Partial<{ view: View; repoState: ContextRepoState; mode: "agent" | "skill" }> = {}) {
  const onSave = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextAttachments
        mode={props.mode ?? "agent"}
        repoId="r1"
        repoState={props.repoState ?? "ok"}
        view={props.view ?? VIEW}
        documents={DOCS}
        onSave={onSave}
      />
    </NextIntlClientProvider>,
  );
  return onSave;
}

const rowPaths = () =>
  within(screen.getByRole("list", { name: "Project documents" }))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-path"));
const rowOf = (path: string) => document.querySelector(`li[data-path="${path}"]`) as HTMLElement;

describe("Context tab (agent)", () => {
  it("lists own, inherited, then other documents with labels; every change saves the whole list", () => {
    const onSave = renderTab();
    expect(screen.getByText("Project context")).toBeInTheDocument();
    expect(screen.getByText("4 of 5 attached")).toBeInTheDocument();
    expect(rowPaths()).toEqual([
      "specs/security-baseline.md",
      "specs/public-api.md",
      "specs/gone.md",
      "insights/perf-budget.md",
      "docs/architecture.md",
    ]);
    expect(within(rowOf("specs/gone.md")).getByText("not in this repo")).toBeInTheDocument();
    expect(within(rowOf("specs/public-api.md")).getByText("truncated")).toBeInTheDocument();
    expect(within(rowOf("insights/perf-budget.md")).getByText("via pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("≈ 367 tokens")).toBeInTheDocument();

    fireEvent.click(within(rowOf("docs/architecture.md")).getByRole("checkbox"));
    expect(onSave).toHaveBeenLastCalledWith([
      "specs/security-baseline.md",
      "specs/public-api.md",
      "specs/gone.md",
      "docs/architecture.md",
    ]);
    fireEvent.click(within(rowOf("specs/security-baseline.md")).getByRole("checkbox"));
    expect(onSave).toHaveBeenLastCalledWith(["specs/public-api.md", "specs/gone.md"]);
    // Inherited rows are read-only.
    onSave.mockClear();
    fireEvent.click(within(rowOf("insights/perf-budget.md")).getByRole("checkbox"));
    expect(onSave).not.toHaveBeenCalled();

    // NFR-7 — keyboard reorder.
    fireEvent.keyDown(rowOf("specs/security-baseline.md"), { key: "ArrowDown", altKey: true });
    expect(onSave).toHaveBeenLastCalledWith(["specs/public-api.md", "specs/security-baseline.md", "specs/gone.md"]);
  });

  it("filters by path with drag off, warns over the budget, and says why paths can't be counted", () => {
    renderTab({ view: { ...VIEW, requested_tokens: 30000, total_tokens: 24000 } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter documents…" }), { target: { value: "SPECS/" } });
    expect(rowPaths()).toEqual(["specs/security-baseline.md", "specs/public-api.md", "specs/gone.md"]);
    expect(rowOf("specs/security-baseline.md")).toHaveAttribute("draggable", "false");
    expect(screen.getByText("Clear the filter to reorder documents.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Over the 24,000-token budget: 30,000 tokens requested");
    cleanup();

    renderTab({ repoState: "no_repo" });
    expect(screen.getByText("No active repository — attached paths can’t be counted.")).toBeInTheDocument();
    expect(screen.getByText("can’t be counted")).toBeInTheDocument();
    expect(rowPaths()).toEqual(["specs/security-baseline.md", "specs/public-api.md", "specs/gone.md", "insights/perf-budget.md"]);
  });

  it("opens Preview with the rendered document and its tokens, and closes it on Escape", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Preview specs/security-baseline.md" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Security baseline" })).toBeInTheDocument();
    expect(within(dialog).getByText("≈ 317 tokens")).toBeInTheDocument();
    expect(dialog.querySelector("img")).toBeNull();
    // A path the repo lacks has no Preview.
    expect(screen.queryByRole("button", { name: "Preview specs/gone.md" })).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Context tab (skill)", () => {
  it("shows its own count, the inheritance note and what it serializes as", () => {
    renderTab({ mode: "skill", view: { ...VIEW, items: VIEW.items.filter((i) => !i.via_skill).slice(0, 1) } });
    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(screen.getByText(/## Project context\s+- specs\/security-baseline\.md/)).toBeInTheDocument();
    expect(screen.getByText("Full text is inserted at run time.")).toBeInTheDocument();
  });
});
