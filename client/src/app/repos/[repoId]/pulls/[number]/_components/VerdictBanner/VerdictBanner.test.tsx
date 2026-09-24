import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });
});

describe("VerdictBanner — run usage line (L01)", () => {
  const base = {
    verdict: "request_changes" as const,
    summary: "Hardcoded secret introduced.",
    score: 42,
    findingsCount: 1,
    blockers: 1,
  };

  it("shows cost · in→out for the review's run", () => {
    renderWithIntl(<VerdictBanner {...base} costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent("$0.014 · 8.2K→1.3K");
  });

  it("omits the line when the run is unknown", () => {
    renderWithIntl(<VerdictBanner {...base} />);
    expect(screen.queryByTestId("run-cost")).not.toBeInTheDocument();
  });
});
