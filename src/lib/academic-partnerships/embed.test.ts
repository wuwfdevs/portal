import { describe, expect, it } from "vitest";
import { buildGroveEmbedCode, embedFormUrl, publicFormUrl } from "./embed";

const SITE = "https://tools.wuwf.org";

describe("publicFormUrl", () => {
  it("builds the standalone URL", () => {
    expect(publicFormUrl(SITE)).toBe("https://tools.wuwf.org/partner");
  });

  it("tolerates a trailing slash on the site URL", () => {
    expect(publicFormUrl("https://tools.wuwf.org/")).toBe("https://tools.wuwf.org/partner");
  });
});

describe("embedFormUrl", () => {
  it("points at the chrome-free variant", () => {
    expect(embedFormUrl(SITE)).toBe("https://tools.wuwf.org/partner/embed");
  });
});

describe("buildGroveEmbedCode", () => {
  const code = buildGroveEmbedCode({ siteUrl: SITE });

  it("points at the embed route", () => {
    expect(code).toContain('src="https://tools.wuwf.org/partner/embed"');
  });

  it("carries an accessible title", () => {
    expect(code).toContain('title="WUWF Academic Partnership Inquiry"');
  });

  it("is responsive inside an article column", () => {
    expect(code).toContain('width="100%"');
    expect(code).toContain("max-width:100%");
  });

  it("uses a generous fixed height, no resizer script", () => {
    expect(code).toContain('height="2600"');
  });

  it("escapes a title that would otherwise break out of the attribute", () => {
    const escaped = buildGroveEmbedCode({
      siteUrl: SITE,
      title: 'Partner" onload="alert(1)',
    });
    expect(escaped).not.toContain('onload="alert(1)"');
    expect(escaped).toContain("&quot;");
  });
});
