import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "@/../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const mutation = (mutate: ReturnType<typeof vi.fn>) => ({
  mutate,
  isPending: false,
  error: null,
  variables: undefined,
});
vi.mock("@/lib/hooks", () => ({
  useCreateSkill: () => mutation(createMutate),
  useUpdateSkill: () => mutation(updateMutate),
  useDeleteSkill: () => mutation(deleteMutate),
}));

import { ConfigTab } from "./ConfigTab";

const SKILL: Skill = {
  id: "sk1",
  name: "corner-cases",
  description: "Flag missing boundary tests",
  type: "rubric",
  source: "manual",
  body: "# Corner cases\nCheck 0, 1, max.",
  enabled: true,
  version: 4,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderTab(skill?: Skill) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("edits the body, shows unsaved + tokens, and saves only the changed fields with the note", () => {
    renderTab(SKILL);
    expect(screen.getByText("corner-cases.md")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getByText("8 tokens")).toBeInTheDocument(); // 31 chars → ceil(31/4)
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();

    const body = screen.getByRole("textbox", { name: "Skill body (markdown)" });
    fireEvent.change(body, { target: { value: "# Corner cases\nCheck 0, 1, max, empty." } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("10 tokens")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "What changed?" }), {
      target: { value: "added empty input" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { body: "# Corner cases\nCheck 0, 1, max, empty.", note: "added empty input" } },
      expect.anything(),
    );
  });

  it("Cancel resets the form; the Enabled toggle saves immediately without a content patch", () => {
    renderTab(SKILL);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "renamed" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByDisplayValue("corner-cases")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
  });

  it("creates a new custom skill and opens it", () => {
    createMutate.mockImplementation((_input, opts) => opts?.onSuccess?.({ id: "sk-new", version: 1 }));
    renderTab();
    expect(screen.getByDisplayValue("custom")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "  my-skill " } });
    fireEvent.change(screen.getByRole("textbox", { name: "Skill body (markdown)" }), { target: { value: "Flag X." } });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(createMutate).toHaveBeenCalledWith(
      {
        name: "my-skill",
        description: "",
        type: "custom",
        body: "Flag X.",
        enabled: true,
        source: "manual",
        note: undefined,
      },
      expect.anything(),
    );
    expect(push).toHaveBeenCalledWith("/skills/sk-new");
  });
});
