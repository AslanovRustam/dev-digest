import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachments, ContextDocList } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../messages/en/context.json";

const mutate = vi.fn();
let activeRepo: { id: string } | null = { id: "r1" };
let attachmentsQ: { data?: ContextAttachments; isError: boolean; error: unknown; refetch: () => void };
const LIST: ContextDocList = {
  state: "ok",
  scanned_at: "2026-11-01T10:00:00.000Z",
  total: 2,
  roots: ["specs", "docs", "insights"],
  documents: [
    { path: "specs/public-api.md", type: "specs", tokens: 120, too_large: false, used_by_agents: 1 },
    { path: "docs/architecture.md", type: "docs", tokens: 80, too_large: false, used_by_agents: 0 },
  ],
};

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo }) }));
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: (repoId: string | null) => ({
    data: repoId ? LIST : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useContextAttachments: () => attachmentsQ,
  useSetContextAttachments: () => ({ mutate, error: null }),
  useContextDocument: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  activeRepo = { id: "r1" };
});

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextTab skillId="s1" />
    </NextIntlClientProvider>,
  );
}

const VIEW: ContextAttachments = {
  items: [{ path: "specs/public-api.md", via_skill: null, status: "present", tokens: 120, truncated: false, dropped: false }],
  total_tokens: 120,
  requested_tokens: 120,
  budget: 24000,
};

describe("Skill editor — Context tab", () => {
  it("shows the skill's documents, what they serialize as, and saves a check", () => {
    attachmentsQ = { data: VIEW, isError: false, error: null, refetch: vi.fn() };
    renderTab();
    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText(/## Project context\s+- specs\/public-api\.md/)).toBeInTheDocument();
    expect(screen.getAllByText("≈ 120 tokens")).toHaveLength(2); // the row and the total
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(mutate).toHaveBeenCalledWith(["specs/public-api.md", "docs/architecture.md"]);
  });

  it("without an active repo lists only the attached paths, uncounted (AC-14)", () => {
    activeRepo = null;
    attachmentsQ = { data: { ...VIEW, items: [{ ...VIEW.items[0]!, status: "unknown", tokens: null }], total_tokens: 0 }, isError: false, error: null, refetch: vi.fn() };
    renderTab();
    expect(screen.getByText("No active repository — attached paths can’t be counted.")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("shows Not found when the skill is gone (AC-39)", () => {
    attachmentsQ = { isError: true, error: new ApiError("Skill not found", 404, "not_found"), refetch: vi.fn() };
    renderTab();
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });
});
