/** PRRow — the list's COST cell (L01): latest review's summed cost, "—" when unknown. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

const PR: PrMeta = {
  id: "pr-1",
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "marisa.koch",
  branch: "feat/rate-limit-public",
  base: "main",
  head_sha: "a1b2c3d",
  additions: 247,
  deletions: 38,
  files_count: 9,
  status: "needs_review",
  opened_at: null,
  updated_at: null,
  score: 61,
};

function renderRow(pr: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={pr} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the latest review's cost compactly", () => {
    renderRow({ ...PR, cost_usd: 0.014 });
    expect(screen.getByTestId("run-cost")).toHaveTextContent(/^\$0\.014$/);
  });

  it("shows a dash when the cost is unknown (never reviewed / running / unpriced)", () => {
    renderRow({ ...PR, cost_usd: null });
    expect(screen.getByTestId("run-cost")).toHaveTextContent("—");
  });
});
