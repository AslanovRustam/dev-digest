/** Trace drawer → Findings section: severity counts, local filter, full finding cards. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runsMessages from "../../../../../../../../../../messages/en/runs.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { finding } from "@/test/findings-fixture";

const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsSection } from "./FindingsSection";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const FINDINGS = [
  finding({ id: "w1", title: "Retry-After header omitted on 429", severity: "WARNING", category: "bug" }),
  finding({
    id: "c1",
    title: "Hardcoded Stripe secret key in commit",
    severity: "CRITICAL",
    suggestion: "Move the key to `STRIPE_SECRET_KEY`.",
  }),
];

function renderSection(props: Partial<React.ComponentProps<typeof FindingsSection>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages }}>
      <FindingsSection findings={FINDINGS} prId="pr-1" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsSection (trace drawer)", () => {
  it("shows per-severity counts and the run's findings, most severe first and expanded", () => {
    renderSection();
    expect(screen.getByTestId("severity-tally")).toHaveAccessibleName("1 critical, 1 warning");
    const titles = screen.getAllByText(/Hardcoded Stripe|Retry-After/).map((el) => el.textContent);
    expect(titles).toEqual(["Hardcoded Stripe secret key in commit", "Retry-After header omitted on 429"]);
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
  });

  it("filters to one severity on click", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /1 WARNING/ }));
    expect(screen.getByText("Retry-After header omitted on 429")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded Stripe secret key in commit")).not.toBeInTheDocument();
    expect(screen.queryByText("Hide low confidence")).not.toBeInTheDocument();
  });

  it("wires accept/dismiss to the PR", () => {
    renderSection();
    fireEvent.click(screen.getByText("Accept"));
    expect(mutate).toHaveBeenCalledWith({ findingId: "c1", action: "accept", prId: "pr-1" });
  });

  it("is read-only without a PR id, and says so when the run found nothing", () => {
    const { unmount } = renderSection({ prId: null });
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
    unmount();
    renderSection({ findings: [] });
    expect(screen.getByText("No findings for this run.")).toBeInTheDocument();
    expect(screen.queryByTestId("severity-tally")).not.toBeInTheDocument();
  });
});
