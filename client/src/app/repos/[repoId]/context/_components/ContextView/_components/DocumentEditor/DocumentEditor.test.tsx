import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../../messages/en/context.json";

const mutate = vi.fn();
let saveState: { isPending: boolean; error: unknown } = { isPending: false, error: null };
vi.mock("@/lib/hooks/project-context", () => ({
  useSaveContextDocument: () => ({ mutate, ...saveState }),
}));

import { DocumentEditor } from "./DocumentEditor";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  saveState = { isPending: false, error: null };
});

function renderEditor(mode: "create" | "update" = "update") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <DocumentEditor
        repoId="r1"
        mode={mode}
        initialPath="specs/public-api.md"
        initialText="# Public API"
        baseVersion="v1"
        onCancel={vi.fn()}
        onSaved={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("Project Context document editor", () => {
  it("edits the source with a default message and sends ONE save per click burst", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Markdown source"), { target: { value: "# Public API v2" } });
    fireEvent.change(screen.getByLabelText("Commit message"), { target: { value: "docs: tighten limits" } });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      path: "specs/public-api.md",
      text: "# Public API v2",
      mode: "update",
      base_version: "v1",
      message: "docs: tighten limits",
    });
  });

  it("shows Committing… with Save disabled while the save runs (AC-34)", () => {
    saveState = { isPending: true, error: null };
    renderEditor();
    expect(screen.getByRole("button", { name: "Committing…" })).toBeDisabled();
  });

  it("places each failure where the user can act on it, keeping the text", () => {
    saveState = { isPending: false, error: new ApiError("Changed on GitHub. Rescan and reapply your edit.", 409, "changed_upstream") };
    const { unmount } = renderEditor();
    expect(screen.getByRole("alert")).toHaveTextContent("Changed on GitHub. Rescan and reapply your edit.");
    expect(screen.getByLabelText("Markdown source")).toHaveValue("# Public API");
    unmount();

    saveState = { isPending: false, error: new ApiError("GitHub refused the write: Bad credentials", 403, "github_refused") };
    renderEditor();
    expect(screen.getByRole("alert")).toHaveTextContent("GitHub refused the write: Bad credentials");
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
    cleanup();

    saveState = { isPending: false, error: new ApiError("Only .md files are allowed", 422, "validation_error") };
    renderEditor("create");
    const pathField = screen.getByLabelText("File path");
    expect(pathField).toHaveAttribute("aria-invalid", "true");
    expect(pathField).toHaveAccessibleDescription("Only .md files are allowed");
    cleanup();

    saveState = { isPending: false, error: new ApiError("Cannot reach the DevDigest engine", 0, "network_error") };
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Markdown source")).toHaveValue("# Public API");
  });
});
