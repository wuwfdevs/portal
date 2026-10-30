import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewRequestForm } from "./new-request-form";

// docs/bookings-design.md §18: none of the model's words along the happy path.
const FORBIDDEN = /\b(pool|labor class|treatment|draw|reserve|rate model version)\b/i;

const props = {
  action: () => {},
  partners: [
    {
      id: "p1",
      name: "UWF Libraries",
      kind: "uwf_unit" as const,
      kindLabel: "UWF unit",
      contactName: null,
      contactEmail: null,
      defaultFundingIndex: null,
    },
  ],
  packages: [
    {
      id: "w",
      name: "Basic event webcast",
      unitLabel: "event",
      includes: "5 staff hours, 10 student hours",
    },
  ],
  timesOfDay: [{ key: "08:00-12:00", label: "Morning" }],
  cancelHref: "/bookings/requests",
  noRateCard: false,
};

function visibleText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

describe("NewRequestForm", () => {
  const html = renderToStaticMarkup(<NewRequestForm {...props} />);

  it("uses none of the model's words", () => {
    expect(visibleText(html)).not.toMatch(FORBIDDEN);
  });

  it("asks only for the partner, the service and the date up front; the rest is under More details", () => {
    const [front, more] = html.split("More details");
    expect(front).toContain("Who is it for?");
    expect(front).toContain("What do they need?");
    expect(front).toContain("Event date");
    expect(front).not.toContain('name="contact_name"');
    expect(more).toContain('name="contact_name"');
  });

  it("does not ask the strategic question until a UWF unit is known", () => {
    expect(html).not.toContain("strategic or applied-learning");
  });

  it("never offers an advanced-model field on the way in", () => {
    expect(html).not.toMatch(/name="(treatment|labor_|pool_)/);
  });
});
