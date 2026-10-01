import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionSkillDraft } from "@devdigest/shared";
import conventions from "@/../messages/en/conventions.json";
import skills from "@/../messages/en/skills.json";

const DRAFT: ConventionSkillDraft = {
  name: "payments-api-conventions",
  description: "Use when reviewing changes in payments-api. Flag code that breaks one of its 2 house conventions.",
  type: "convention",
  body: "House conventions for `payments-api`.\n\n## async\nUse async/await.",
  evidence_files: ["src/a.ts:1-2", "src/b.ts:3"],
};

const createMutate = vi.fn();
const draftHook = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useConventionSkillDraft: (...args: unknown[]) => draftHook(...args),
  useAgents: () => ({ data: [{ id: "ag1", name: "API Contract Reviewer" }] }),
  useCreateSkillFromConventions: () => ({ mutate: createMutate, isPending: false, error: null }),
}));

import { ToastProvider } from "@/lib/toast";
import { CreateSkillModal } from "./CreateSkillModal";

const cand = (id: string): ConventionCandidate => ({
  id,
  repo_id: "r1",
  scan_id: "s1",
  source_sha: "abc",
  category: "async",
  rule: `rule ${id}`,
  evidence_path: "src/a.ts",
  evidence_start_line: 1,
  evidence_end_line: 2,
  evidence_snippet: "x",
  confidence: 0.9,
  status: "accepted",
  skill_id: null,
  skill_name: null,
  created_at: "2026-10-01T10:00:00.000Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  draftHook.mockReturnValue({ data: DRAFT, isError: false, error: null });
  createMutate.mockImplementation((_input, opts) =>
    opts?.onSuccess?.({ skill_id: "sk1", name: _input.name, version: 1, convention_ids: [], linked_agent_ids: [] }),
  );
});
afterEach(cleanup);

function renderModal() {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <ToastProvider>
        <CreateSkillModal repoId="r1" repoName="payments-api" candidates={[cand("c1"), cand("c2")]} onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("CreateSkillModal", () => {
  it("requests the draft for exactly the accepted candidates it was given", () => {
    renderModal();
    expect(draftHook).toHaveBeenCalledWith("r1", ["c1", "c2"], true);
    expect(screen.getByText(/2 accepted conventions/)).toBeInTheDocument();
  });

  it("pre-fills every field from the draft and saves the edited values", () => {
    const onClose = renderModal();
    expect(screen.getByLabelText("Name")).toHaveValue("payments-api-conventions");
    expect(screen.getByLabelText("Skill body (markdown)")).toHaveValue(DRAFT.body);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "payments-house-rules" } });
    fireEvent.change(screen.getByDisplayValue("Don't attach now"), { target: { value: "ag1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(createMutate).toHaveBeenCalledWith(
      {
        convention_ids: ["c1", "c2"],
        name: "payments-house-rules",
        description: DRAFT.description,
        type: "convention",
        enabled: true,
        body: DRAFT.body,
        agent_ids: ["ag1"],
      },
      expect.anything(),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("disables saving without a name", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("shows skeletons until the draft arrives", () => {
    draftHook.mockReturnValue({ data: undefined, isError: false, error: null });
    renderModal();
    expect(screen.getByLabelText("Merging conventions…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });
});
