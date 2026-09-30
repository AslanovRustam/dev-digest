import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "@/../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "untested-branches",
  description: "Flag new branches that no test exercises",
  type: "rubric",
  source: "imported_file",
  body: "# Rule",
  enabled: true,
  version: 5,
  agent_count: 3,
  pull_rate: 0.71,
  accept_rate: 0.74,
};

function renderCard(props: Partial<React.ComponentProps<typeof SkillCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillCard skill={SKILL} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("shows name, type, source and the agents · pull · accept footer", () => {
    renderCard();
    expect(screen.getByText("untested-branches")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("71% pull")).toBeInTheDocument();
    const accept = screen.getByText("74%");
    expect(accept.parentElement).toHaveTextContent("74% accept");
    expect(accept).toHaveStyle({ color: "var(--ok)" });
  });

  it("shows — for rates with no data", () => {
    renderCard({ skill: { ...SKILL, agent_count: 0, pull_rate: null, accept_rate: null } });
    expect(screen.getByText("0 agents")).toBeInTheDocument();
    expect(screen.getByText("— pull")).toBeInTheDocument();
    expect(screen.getByText("—").parentElement).toHaveTextContent("— accept");
  });

  it("toggling calls onToggle without selecting the card; clicking the card selects it", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderCard({ onClick, onToggle });

    fireEvent.click(screen.getByRole("switch", { name: "Enable untested-branches" }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("untested-branches"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
