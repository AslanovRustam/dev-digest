import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const mutate = vi.fn();
let skills: Skill[] = [];
let links: AgentSkillLink[] = [];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: skills, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: links, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const skill = (id: string, name: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: "",
  type: "rubric",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
  ...extra,
});
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});

beforeEach(() => {
  skills = [
    skill("s-flaky", "flaky-tests"),
    skill("s-over", "over-mocking", { type: "convention" }),
    skill("s-corner", "corner-cases"),
    skill("s-legacy", "legacy-rules", { enabled: false, type: "security" }),
  ];
  // flaky first, then over-mocking; corner-cases and legacy-rules are unlinked.
  links = [link("s-flaky", 0), link("s-over", 1)];
});

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

const rowNames = () =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-skill-id"));

describe("Agent editor — Skills tab", () => {
  it("lists linked skills first, counts enabled rows and marks globally disabled skills", () => {
    renderTab();
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    expect(rowNames()).toEqual(["s-flaky", "s-over", "s-corner", "s-legacy"]);
    expect(screen.getByRole("checkbox", { name: "flaky-tests" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "corner-cases" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
    expect(screen.getByText(/Drag to reorder\./)).toBeInTheDocument();
  });

  it("unchecking a linked skill keeps its position; checking an unlinked one appends it", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "flaky-tests" }));
    expect(mutate).toHaveBeenLastCalledWith({
      items: [
        { skill_id: "s-flaky", enabled: false },
        { skill_id: "s-over", enabled: true },
      ],
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "corner-cases" }));
    expect(mutate).toHaveBeenLastCalledWith({
      items: [
        { skill_id: "s-flaky", enabled: true },
        { skill_id: "s-over", enabled: true },
        { skill_id: "s-corner", enabled: true },
      ],
    });
  });

  it("reorders linked skills with Alt+Arrow keys and by drag and drop", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder flaky-tests" }), {
      key: "ArrowDown",
      altKey: true,
    });
    expect(mutate).toHaveBeenLastCalledWith({
      items: [
        { skill_id: "s-over", enabled: true },
        { skill_id: "s-flaky", enabled: true },
      ],
    });

    // The last linked row cannot move into the unlinked block.
    mutate.mockReset();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder over-mocking" }), {
      key: "ArrowDown",
      altKey: true,
    });
    expect(mutate).not.toHaveBeenCalled();

    const [flakyRow, overRow] = within(screen.getByRole("list")).getAllByRole("listitem");
    fireEvent.dragStart(overRow!);
    fireEvent.dragOver(flakyRow!);
    fireEvent.drop(flakyRow!);
    expect(mutate).toHaveBeenLastCalledWith({
      items: [
        { skill_id: "s-over", enabled: true },
        { skill_id: "s-flaky", enabled: true },
      ],
    });
  });

  it("disables reordering while the filter has text", () => {
    renderTab();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")[0]).toHaveAttribute("draggable", "true");

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter skills…" }), { target: { value: "o" } });
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((li) => li.getAttribute("data-skill-id"))).toEqual(["s-over", "s-corner"]);
    rows.forEach((li) => expect(li).toHaveAttribute("draggable", "false"));
    expect(screen.getByText(/clear it to drag skills/)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder over-mocking" }), {
      key: "ArrowUp",
      altKey: true,
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("points to the Skills page when the workspace has no skills", () => {
    skills = [];
    links = [];
    renderTab();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a skill" })).toHaveAttribute("href", "/skills");
  });
});
