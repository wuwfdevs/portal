import { describe, expect, it } from "vitest";
import {
  buildGroveEmbedCode,
  embedQueryUrl,
  publicQueryUrl,
  recommendedEmbedHeight,
} from "./embed";

const SITE = "https://tools.wuwf.org";

describe("publicQueryUrl", () => {
  it("builds the standalone URL", () => {
    expect(publicQueryUrl(SITE, "abcdefgh23456789")).toBe(
      "https://tools.wuwf.org/listen/abcdefgh23456789",
    );
  });

  it("tolerates a trailing slash on the site URL", () => {
    expect(publicQueryUrl("https://tools.wuwf.org/", "abcdefgh23456789")).toBe(
      "https://tools.wuwf.org/listen/abcdefgh23456789",
    );
  });
});

describe("embedQueryUrl", () => {
  it("points at the chrome-free variant", () => {
    expect(embedQueryUrl(SITE, "abcdefgh23456789")).toBe(
      "https://tools.wuwf.org/listen/abcdefgh23456789/embed",
    );
  });
});

describe("recommendedEmbedHeight", () => {
  it("grows with the question count", () => {
    expect(recommendedEmbedHeight(1)).toBeLessThan(recommendedEmbedHeight(5));
  });

  it("stays inside a sane range whatever it is given", () => {
    expect(recommendedEmbedHeight(0)).toBe(560);
    expect(recommendedEmbedHeight(-4)).toBe(560);
    expect(recommendedEmbedHeight(500)).toBe(760);
  });
});

describe("buildGroveEmbedCode", () => {
  const code = buildGroveEmbedCode({
    siteUrl: SITE,
    publicId: "abcdefgh23456789",
    title: "Tell us how housing costs are affecting you",
    questionCount: 3,
  });

  it("points at the embed route", () => {
    expect(code).toContain('src="https://tools.wuwf.org/listen/abcdefgh23456789/embed"');
  });

  it("delegates the microphone — without this the recorder cannot work in a frame", () => {
    expect(code).toContain('allow="microphone"');
  });

  it("carries an accessible title", () => {
    expect(code).toContain('title="Tell us how housing costs are affecting you"');
  });

  it("is responsive inside an article column", () => {
    expect(code).toContain('width="100%"');
    expect(code).toContain("max-width:100%");
  });

  it("uses the height for this question count", () => {
    expect(code).toContain(`height="${recommendedEmbedHeight(3)}"`);
  });

  it("escapes a title that would otherwise break out of the attribute", () => {
    const escaped = buildGroveEmbedCode({
      siteUrl: SITE,
      publicId: "abcdefgh23456789",
      title: 'Housing" onload="alert(1)',
      questionCount: 1,
    });
    expect(escaped).not.toContain('onload="alert(1)"');
    expect(escaped).toContain("&quot;");
  });
});
