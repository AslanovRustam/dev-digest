import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "@/../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 1, note: "Initial version", body: "# Rule\nold line", created_at: "2026-09-01T10:00:00Z" },
  { skill_id: "sk1", version: 2, note: "Tightened wording", body: "# Rule\nnew line", created_at: "2026-09-12T08:30:00Z" },
];

const restoreMutate = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";
import { formatVersionDate, newestFirst } from "./helpers";

const SKILL: Skill = {
  id: "sk1",
  name: "corner-cases",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# Rule\nnew line",
  enabled: true,
  version: 2,
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const rowOf = (note: string) => screen.getByText(note).closest("li")!;

describe("VersionsTab", () => {
  it("lists versions newest first with the current one marked, and diffs an older one inline", () => {
    renderTab();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("v2")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Current")).toBeInTheDocument();
    expect(within(rows[0]!).queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText("2026-09-01")).toBeInTheDocument();

    fireEvent.click(within(rowOf("Initial version")).getByRole("button", { name: "Diff" }));
    const removed = screen.getByText("old line").closest("[data-kind]")!;
    const added = screen.getByText("new line").closest("[data-kind]")!;
    expect(removed).toHaveAttribute("data-kind", "del");
    expect(removed).toHaveTextContent("-old line");
    expect(added).toHaveAttribute("data-kind", "add");
    expect(added).toHaveTextContent("+new line");

    fireEvent.click(within(rowOf("Initial version")).getByRole("button", { name: "Hide diff" }));
    expect(screen.queryByText("old line")).not.toBeInTheDocument();
  });

  it("restores only after confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderTab();
    const restore = within(rowOf("Initial version")).getByRole("button", { name: "Restore" });

    fireEvent.click(restore);
    expect(restoreMutate).not.toHaveBeenCalled();

    fireEvent.click(restore);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(restoreMutate).toHaveBeenCalledWith({ id: "sk1", version: 1 }, expect.anything());
  });
});

describe("VersionsTab helpers", () => {
  it("formats dates as YYYY-MM-DD and sorts newest first", () => {
    expect(formatVersionDate("2026-09-12T08:30:00Z")).toBe("2026-09-12");
    expect(formatVersionDate("not a date")).toBe("not a date");
    expect(newestFirst(VERSIONS).map((v) => v.version)).toEqual([2, 1]);
  });
});
