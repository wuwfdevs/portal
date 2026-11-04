import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StationProvider } from "@/components/station-provider";
import { PublicPolicyNotice } from "@/components/ui/public-policy-notice";
import { stationProfileFrom } from "@/lib/station-brand";

function render(raw: Record<string, string> | null): string {
  return renderToStaticMarkup(
    raw === null ? (
      <PublicPolicyNotice />
    ) : (
      <StationProvider profile={stationProfileFrom(raw)}>
        <PublicPolicyNotice />
      </StationProvider>
    ),
  );
}

describe("PublicPolicyNotice", () => {
  it("says what the station's settings say, with the link", () => {
    const html = render({
      public_notice_text: "This page is provided by the licensee under its",
      public_notice_link_label: "Privacy Policy",
      public_notice_link_url: "/policies/privacy.pdf",
    });
    expect(html).toContain("This page is provided by the licensee under its");
    expect(html).toContain('href="/policies/privacy.pdf"');
    expect(html).toContain("Privacy Policy");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/Privacy Policy<\/a>\.<\/p>/);
  });

  it("shows only the sentence when there is no link", () => {
    const html = render({ public_notice_text: "Provided by the licensee." });
    expect(html).toContain("Provided by the licensee.");
    expect(html).not.toContain("<a");
  });

  it("shows nothing for a station that has no notice", () => {
    expect(render({ short_name: "KXYZ" })).toBe("");
  });

  it("shows nothing when no station is provided", () => {
    expect(render(null)).toBe("");
  });
});
