import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import messages from "@/../messages/en/skills.json";

let stats: SkillStats;
vi.mock("@/lib/hooks", () => ({
  useSkillStats: () => ({ data: stats, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";
import { toSlices } from "./_components/CategoryDonut/helpers";

afterEach(cleanup);

const FULL: SkillStats = {
  skill_id: "sk1",
  window_days: 30,
  used_by: 3,
  runs_total: 14,
  runs_pulled: 10,
  pull_rate: 0.714,
  findings: 96,
  accepted: 40,
  dismissed: 14,
  accept_rate: 0.74,
  by_category: [
    { category: "test", count: 60 },
    { category: "bug", count: 36 },
  ],
  agents: [
    { id: "a1", name: "Test Quality Reviewer", agent_enabled: true, link_enabled: true },
    { id: "a2", name: "API Contract Reviewer", agent_enabled: true, link_enabled: false },
  ],
};

function renderStats(data: SkillStats) {
  stats = data;
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skillId="sk1" />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("renders the four tiles, the linking agents and the category counts", () => {
    renderStats(FULL);
    expect(within(screen.getByRole("group", { name: "Used by" })).getByText("3 agents")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Pull frequency" })).getByText("71%")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Accept rate" })).getByText("74%")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Findings (30d)" })).getByText("96")).toBeInTheDocument();

    const off = screen.getByText("API Contract Reviewer").closest("li")!;
    expect(within(off).getByText("off")).toBeInTheDocument();
    expect(within(off).getByRole("link", { name: /Open/ })).toHaveAttribute("href", "/agents/a2?tab=skills");
    const on = screen.getByText("Test Quality Reviewer").closest("li")!;
    expect(within(on).queryByText("off")).not.toBeInTheDocument();

    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(screen.getByText(/Correlated, not causal/)).toBeInTheDocument();
  });

  it("shows — for null rates and empty-state panels", () => {
    renderStats({
      ...FULL,
      used_by: 0,
      runs_total: 0,
      runs_pulled: 0,
      pull_rate: null,
      findings: 0,
      accepted: 0,
      dismissed: 0,
      accept_rate: null,
      by_category: [],
      agents: [],
    });
    expect(within(screen.getByRole("group", { name: "Pull frequency" })).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Accept rate" })).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No agent links this skill yet.")).toBeInTheDocument();
    expect(screen.getByText("No findings in the last 30 days.")).toBeInTheDocument();
  });
});

describe("toSlices", () => {
  it("drops zero counts, sorts by count and colours known + unknown categories", () => {
    const slices = toSlices([
      { category: "style", count: 2 },
      { category: "security", count: 9 },
      { category: "docs", count: 4 },
      { category: "perf", count: 0 },
    ]);
    expect(slices.map((s) => s.category)).toEqual(["security", "docs", "style"]);
    expect(slices[0]!.color).toBe("var(--crit)");
    expect(slices[1]!.color).toMatch(/^#/);
  });
});
