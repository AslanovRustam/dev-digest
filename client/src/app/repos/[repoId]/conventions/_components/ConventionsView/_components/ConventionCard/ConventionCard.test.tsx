import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "@/../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  scan_id: "s1",
  source_sha: "abc123",
  category: "async",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_start_line: 23,
  evidence_end_line: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  skill_id: null,
  skill_name: null,
  created_at: "2026-10-01T10:00:00.000Z",
};

function renderCard(over: Partial<ConventionCandidate> = {}, repoFullName: string | null = "acme/payments-api") {
  const onPatch = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <ConventionCard candidate={{ ...CANDIDATE, ...over }} repoFullName={repoFullName} onPatch={onPatch} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onPatch;
}

describe("ConventionCard", () => {
  it("shows the rule, the verified snippet and the confidence", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: CANDIDATE.rule })).toBeInTheDocument();
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("async")).toBeInTheDocument();
  });

  it("links the evidence to GitHub at the scan's commit, not the default branch", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "src/api/users.ts:23-31" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/api/users.ts#L23-L31",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders plain text when the repo or commit is unknown", () => {
    renderCard({ source_sha: null });
    expect(screen.queryByRole("link", { name: /src\/api\/users\.ts/ })).toBeNull();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
  });

  it("accepts and rejects; clicking an active state returns it to pending", () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onPatch).toHaveBeenLastCalledWith({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onPatch).toHaveBeenLastCalledWith({ status: "rejected" });
    cleanup();

    const onPatch2 = renderCard({ status: "accepted" });
    const accepted = screen.getByRole("button", { name: "Accepted" });
    expect(accepted).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(accepted);
    expect(onPatch2).toHaveBeenLastCalledWith({ status: "pending" });
  });

  it("edits the rule and category in place, sending only what changed", () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "Prefer async/await" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onPatch).toHaveBeenCalledWith({ rule: "Prefer async/await" });
  });

  it("marks a candidate already merged into a skill", () => {
    renderCard({ status: "accepted", skill_id: "sk1", skill_name: "payments-conventions" });
    expect(screen.getByRole("link", { name: "in skill payments-conventions" })).toHaveAttribute("href", "/skills/sk1");
  });
});
