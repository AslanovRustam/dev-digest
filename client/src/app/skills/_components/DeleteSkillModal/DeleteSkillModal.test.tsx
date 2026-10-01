import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "@/../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const push = vi.fn();
let pathname = "/skills";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => pathname,
}));

const deleteMutate = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { DeleteSkillModal } from "./DeleteSkillModal";

const SKILL: Skill = {
  id: "sk1",
  name: "corner-cases",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 2,
  agent_count: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  pathname = "/skills";
});
afterEach(cleanup);

function renderModal(onClose = vi.fn(), skill: Skill = SKILL) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <DeleteSkillModal skill={skill} onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("DeleteSkillModal", () => {
  it("names the skill and warns about linked agents", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toHaveTextContent("corner-cases and its version history will be deleted");
    expect(screen.getByText(/2 agents link this skill/)).toBeInTheDocument();
  });

  it("Cancel and Escape close without deleting", () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(window, { key: "Escape" });
    // Escape with focus inside the dialog: the wrapper stops keydown before it
    // reaches window, so it must close the dialog itself.
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("Delete removes the skill, closes, and leaves the detail page of the deleted skill", () => {
    pathname = "/skills/sk1";
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.any(Object));

    deleteMutate.mock.calls[0]![1].onSuccess();
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills");
  });

  it("stays on the current page when another skill is open", () => {
    pathname = "/skills/other";
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    deleteMutate.mock.calls[0]![1].onSuccess();
    expect(push).not.toHaveBeenCalled();
  });
});
