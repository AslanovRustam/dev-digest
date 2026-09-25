/** FindingsPreviewList — the hover card's short finding list (+ SeverityTally). */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { finding } from "@/test/findings-fixture";
import { SeverityTally } from "@/components/severity-tally";
import { FindingsPreviewList } from "./FindingsPreviewList";

afterEach(cleanup);

function renderList(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPreviewList", () => {
  it("shows each finding's title, category, file:line, confidence and a plain excerpt", () => {
    renderList(
      <FindingsPreviewList
        findings={[
          finding({
            title: "Hardcoded Stripe secret key in commit",
            rationale: "Line 12 contains `sk_live_` — a **secret key**.",
            confidence: 0.98,
          }),
          finding({ title: "N+1 query", severity: "WARNING", category: "perf", start_line: 45, end_line: 52 }),
        ]}
        repoFullName="acme/payments-api"
        headSha="abc123"
      />,
    );
    expect(screen.getByText("2 findings")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
    expect(screen.getByText("Line 12 contains sk_live_ — a secret key.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "src/config.ts:45-52" });
    expect(link).toHaveAttribute("href", expect.stringContaining("acme/payments-api/blob/abc123/src/config.ts"));
  });

  it("has loading and empty states", () => {
    const { rerender } = renderList(<FindingsPreviewList findings={[]} loading />);
    expect(screen.getByText("Loading findings…")).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPreviewList findings={[]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("No open findings")).toBeInTheDocument();
  });
});

describe("SeverityTally", () => {
  it("renders non-zero levels only, with an accessible summary", () => {
    render(<SeverityTally counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 4 }} />);
    const tally = screen.getByTestId("severity-tally");
    expect(tally).toHaveAccessibleName("2 critical, 4 suggestion");
    expect(tally.querySelector('[data-severity="WARNING"]')).toBeNull();
    expect(tally.querySelector('[data-severity="SUGGESTION"]')).toHaveTextContent("4");
  });
});
