import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDocList, ContextDocument, ContextSaveResult } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../messages/en/context.json";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/repos/r1/context",
  useSearchParams: () => search,
}));

type Q<T> = { data?: T; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void };
const refetchDocs = vi.fn();
const rescanMutate = vi.fn();
const saveMutate = vi.fn();
let docsQ: Q<ContextDocList>;
let docQ: Q<ContextDocument>;
let docRequests: (string | null | undefined)[] = [];

vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: () => docsQ,
  useContextDocument: (_repo: string, path: string | null | undefined) => {
    docRequests.push(path);
    return docQ;
  },
  useRescanContext: () => ({ mutate: rescanMutate, isPending: false, isError: false, error: null }),
  useSaveContextDocument: () => ({ mutate: saveMutate, isPending: false, error: null }),
}));

import { ContextView } from "./ContextView";

const LIST: ContextDocList = {
  state: "ok",
  scanned_at: "2026-11-01T10:05:00.000Z",
  total: 2,
  roots: ["specs", "docs", "insights"],
  documents: [
    { path: ".devdigest/specs/public-api.md", type: "specs", tokens: 1240, too_large: false, used_by_agents: 3 },
    { path: "docs/architecture.md", type: "docs", tokens: 80, too_large: false, used_by_agents: 0 },
  ],
};
const DOC: ContextDocument = {
  path: ".devdigest/specs/public-api.md",
  type: "specs",
  text: "# Public API — PRD\n\nAll endpoints **MUST** be rate-limited.\n\n<script>alert('x')</script>",
  tokens: 1240,
  version: "v1",
  used_by_agents: 3,
};

const ok = <T,>(data: T): Q<T> => ({ data, isLoading: false, isError: false, error: null, refetch: refetchDocs });

beforeEach(() => {
  search = new URLSearchParams();
  docsQ = ok(LIST);
  docQ = ok(DOC);
  docRequests = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("Project Context page", () => {
  it("shows the tree and footer, previews the first document as inert markdown, and switches documents", () => {
    renderView();
    const tree = screen.getByRole("tree", { name: "Project documents" });
    expect(within(tree).getByRole("button", { name: "public-api.md" })).toBeInTheDocument();
    expect(within(tree).getByRole("button", { name: "architecture.md" })).toBeInTheDocument();
    expect(screen.getByText(/2 documents · scanned/)).toBeInTheDocument();
    expect(screen.getByText("Folders: specs/, docs/, insights/")).toBeInTheDocument();

    // AC-2 — path, tokens, used-by and rendered markdown of the selected document.
    expect(docRequests.at(-1)).toBe(".devdigest/specs/public-api.md");
    expect(screen.getByRole("heading", { name: "Public API — PRD" })).toBeInTheDocument();
    expect(screen.getByText("≈ 1,240 tokens")).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    // AC-36 — raw HTML stays text; nothing executable reaches the DOM.
    expect(document.querySelector("article script")).toBeNull();

    fireEvent.click(within(tree).getByRole("button", { name: "architecture.md" }));
    expect(replace).toHaveBeenCalledWith("/repos/r1/context?doc=docs%2Farchitecture.md");

    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    expect(rescanMutate).toHaveBeenCalledTimes(1);
  });

  it("covers loading, not cloned, empty, error and not-found states", () => {
    docsQ = { isLoading: true, isError: false, error: null, refetch: refetchDocs };
    const { unmount } = renderView();
    expect(screen.getByRole("status", { name: "Loading documents" })).toBeInTheDocument();
    unmount();

    docsQ = ok({ ...LIST, state: "not_cloned", scanned_at: null, total: 0, documents: [] });
    renderView();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();
    cleanup();

    docsQ = ok({ ...LIST, total: 0, documents: [] });
    renderView();
    expect(screen.getByText("No project documents")).toBeInTheDocument();
    expect(screen.getByText("DevDigest lists .md files under folders named specs/, docs/, insights/.")).toBeInTheDocument();
    cleanup();

    docsQ = { isLoading: false, isError: true, error: new ApiError("boom", 500), refetch: refetchDocs };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetchDocs).toHaveBeenCalled();
    cleanup();

    docsQ = { isLoading: false, isError: true, error: new ApiError("Repository not found", 404), refetch: refetchDocs };
    renderView();
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("counts documents beyond the listed 1,000", () => {
    docsQ = ok({ ...LIST, total: 1003 });
    renderView();
    expect(screen.getByText("+1,001 more not listed")).toBeInTheDocument();
  });

  it("New file opens an editor in the selected folder; saving shows the PR link", () => {
    const result: ContextSaveResult = { branch: "devdigest/context/x-1", pr_number: 7, pr_url: "https://github.com/a/b/pull/7" };
    saveMutate.mockImplementation((_body, opts) => opts.onSuccess(result));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "docs" }));
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(screen.getByLabelText("File path")).toHaveValue("docs/untitled.md");
    fireEvent.change(screen.getByLabelText("Markdown source"), { target: { value: "# ADR" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveMutate.mock.calls[0]![0]).toEqual({
      path: "docs/untitled.md",
      text: "# ADR",
      mode: "create",
      message: "docs: add docs/untitled.md",
    });
    expect(screen.getByRole("link", { name: "Pull request #7 opened" })).toHaveAttribute("href", result.pr_url);
  });

  it("New folder asks for its first file; an upload that is not UTF-8 shows the reason by the path field", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    expect(screen.getByLabelText("File path")).toHaveValue(".devdigest/specs/new-folder/untitled.md");
    expect(screen.getByText("A new folder needs its first file — name both in the path.")).toBeInTheDocument();

    const file = new File([new Uint8Array([0x63, 0x61, 0x66, 0xe9])], "latin.md", { type: "text/markdown" });
    fireEvent.change(screen.getByTestId("context-upload"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText("File path")).toHaveValue(".devdigest/specs/latin.md"));
    expect(screen.getByRole("alert")).toHaveTextContent("The file is not valid UTF-8 text.");
    expect(screen.getByLabelText("File path")).toHaveAttribute("aria-invalid", "true");
  });

  it("a confirmed discard via New file again opens a fresh editor and keeps the guard armed", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    fireEvent.change(screen.getByLabelText("Markdown source"), { target: { value: "# My ADR" } });
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Markdown source")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Markdown source"), { target: { value: "draft two" } });
    confirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "architecture.md" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Markdown source")).toHaveValue("draft two");
  });

  it("Rescan over an unsaved edit asks first, then closes the editor it discards", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Markdown source"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    expect(rescanMutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Markdown source")).toHaveValue("changed");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    expect(rescanMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Markdown source")).not.toBeInTheDocument();
  });

  it("asks before leaving an edit with unsaved changes (AC-35)", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const source = screen.getByLabelText("Markdown source");
    expect(source).toHaveValue(DOC.text);
    expect(screen.getByLabelText("Commit message")).toHaveValue("docs: update .devdigest/specs/public-api.md");
    fireEvent.change(source, { target: { value: "changed" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledWith("Discard your unsaved changes?");
    expect(screen.getByLabelText("Markdown source")).toHaveValue("changed");

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "architecture.md" }));
    expect(replace).toHaveBeenCalled();
    expect(screen.queryByLabelText("Markdown source")).not.toBeInTheDocument();
  });
});
