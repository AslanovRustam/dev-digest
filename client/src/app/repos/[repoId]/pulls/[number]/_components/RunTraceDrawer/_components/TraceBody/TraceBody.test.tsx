/** Trace drawer → Prompt assembly: one block per injected skill (L02), legacy fallback. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import runsMessages from "../../../../../../../../../../messages/en/runs.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const BASE: RunTrace = {
  config: { agent: "API Contract", version: "1", provider: "openai", model: "gpt-4.1", pr: 7, source: "local" },
  stats: { duration_ms: 4000, tokens_in: 9000, tokens_out: 800, cost_usd: 0.02, findings: 0, grounding: "0/0 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: null, memory: null, specs: null, user: "Review PR #7" },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

function renderBody(trace: RunTrace) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages }}>
      <TraceBody trace={trace} findings={[]} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByText("Prompt assembly")); // the section starts collapsed
}

describe("TraceBody — prompt assembly", () => {
  it("renders one labelled block per skill, in prompt order, with its tokens", () => {
    renderBody({
      ...BASE,
      prompt_assembly: {
        ...BASE.prompt_assembly,
        skills: "### Skill: response-shape-compat\n…\n### Skill: status-and-error-contract\n…",
        skill_blocks: [
          { skill_id: "s1", name: "response-shape-compat", type: "rubric", version: 3, tokens: 1234, text: "a" },
          { skill_id: "s2", name: "status-and-error-contract", type: "rubric", version: 1, tokens: 88, text: "b" },
        ],
      },
    });
    const labels = screen.getAllByText(/^Skill · /).map((el) => el.textContent);
    expect(labels).toEqual([
      "Skill · response-shape-compat · v3 · ~1,234 tokens",
      "Skill · status-and-error-contract · v1 · ~88 tokens",
    ]);
    // The joined string is not repeated as its own block.
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });

  it("falls back to the single joined skills block for traces without skill_blocks", () => {
    renderBody({ ...BASE, prompt_assembly: { ...BASE.prompt_assembly, skills: "### Skill: legacy" } });
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
    expect(screen.queryByText(/^Skill · /)).not.toBeInTheDocument();
  });
});
