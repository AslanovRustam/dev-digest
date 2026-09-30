import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "@/../messages/en/skills.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const PREVIEW: SkillImportPreview = {
  name: "flaky-tests",
  description: "Flag tests that depend on time or order",
  type: "rubric",
  body: "# Flaky tests\n\nFlag `setTimeout` in tests.",
  source_file: "flaky-tests/SKILL.md",
  ignored_files: [
    { path: "flaky-tests/scripts/detect.sh", reason: "executable" },
    { path: "flaky-tests/logo.png", reason: "non_markdown" },
  ],
  warnings: ["Dropped frontmatter key \"allowed-tools\""],
};

const previewMutate = vi.fn();
const createMutate = vi.fn();
const mutation = (mutate: ReturnType<typeof vi.fn>) => ({
  mutate,
  reset: vi.fn(),
  isPending: false,
  error: null,
});
vi.mock("@/lib/hooks", () => ({
  usePreviewSkillImport: () => mutation(previewMutate),
  useCreateSkill: () => mutation(createMutate),
}));

import { ImportSkillModal } from "./ImportSkillModal";

beforeEach(() => {
  vi.clearAllMocks();
  previewMutate.mockImplementation((_input, opts) => opts?.onSuccess?.(PREVIEW));
  createMutate.mockImplementation((_input, opts) => opts?.onSuccess?.({ id: "sk-new" }));
});
afterEach(cleanup);

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportSkillModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

const pick = (file: File) => fireEvent.change(screen.getByLabelText("Skill file"), { target: { files: [file] } });

describe("ImportSkillModal", () => {
  it("previews a zip, lists what was not imported, and saves it disabled as imported_file", async () => {
    const onClose = renderModal();
    pick(new File(["PK..."], "flaky-tests.zip", { type: "application/zip" }));

    expect(await screen.findByText(/someone else's instructions inside your agent's prompt/)).toBeInTheDocument();
    expect(previewMutate).toHaveBeenCalledWith(
      { filename: "flaky-tests.zip", content_base64: btoa("PK...") },
      expect.anything(),
    );
    expect(screen.getByText("flaky-tests/scripts/detect.sh")).toBeInTheDocument();
    expect(screen.getByText("executable — not run")).toBeInTheDocument();
    expect(screen.getByText("not markdown")).toBeInTheDocument();
    expect(screen.getByText(/allowed-tools/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("flaky-tests")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save as disabled" }));
    expect(createMutate).toHaveBeenCalledWith(
      {
        name: "flaky-tests",
        description: PREVIEW.description,
        type: "rubric",
        body: PREVIEW.body,
        enabled: false,
        source: "imported_file",
        note: "Imported from flaky-tests.zip",
      },
      expect.anything(),
    );
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk-new");
  });

  it("rejects a file over 512 KB without calling the server", () => {
    renderModal();
    pick(new File([new Uint8Array(512 * 1024 + 1)], "huge.md"));
    expect(screen.getByRole("alert")).toHaveTextContent("huge.md is larger than 512 KB.");
    expect(previewMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save as disabled" })).toBeDisabled();
  });
});
