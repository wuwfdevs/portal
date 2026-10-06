import { describe, expect, it } from "vitest";
import { EMBED_HEIGHT, buildGroveEmbedCode, embedFormUrl, publicFormUrl } from "./embed";

const SITE = "https://tools.wuwf.org";

describe("publicFormUrl", () => {
  it("builds the standalone URL", () => {
    expect(publicFormUrl(SITE)).toBe("https://tools.wuwf.org/book");
  });

  it("tolerates a trailing slash on the site URL", () => {
    expect(publicFormUrl("https://tools.wuwf.org/")).toBe("https://tools.wuwf.org/book");
  });
});

describe("embedFormUrl", () => {
  it("points at the chrome-free variant", () => {
    expect(embedFormUrl(SITE)).toBe("https://tools.wuwf.org/book/embed");
  });
});

describe("buildGroveEmbedCode", () => {
  const code = buildGroveEmbedCode({ siteUrl: SITE });

  it("points at the embed route with an accessible title", () => {
    expect(code).toContain('src="https://tools.wuwf.org/book/embed"');
    expect(code).toContain('title="Request production work from WUWF"');
  });

  it("is responsive inside an article column, at a fixed height, with no script", () => {
    expect(code).toContain('width="100%"');
    expect(code).toContain("max-width:100%");
    expect(code).toContain(`height="${EMBED_HEIGHT}"`);
    expect(code).not.toContain("<script");
  });

  it("escapes a title that would otherwise break out of the attribute", () => {
    const escaped = buildGroveEmbedCode({ siteUrl: SITE, title: 'Book" onload="alert(1)' });
    expect(escaped).not.toContain('onload="alert(1)"');
    expect(escaped).toContain("&quot;");
  });
});
