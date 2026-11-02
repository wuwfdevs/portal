import { describe, expect, it } from "vitest";
import { buildSignInUrl, readWebsiteConfig } from "./handoff";

const SECRET = "s".repeat(40);

describe("readWebsiteConfig", () => {
  it("accepts an https origin and a long secret", () => {
    expect(readWebsiteConfig({ WEBSITE_ORIGIN: "https://www.wuwf.org", WEBSITE_IDENTITY_SECRET: SECRET })).toEqual({
      ok: true,
      config: { origin: "https://www.wuwf.org", secret: SECRET },
    });
  });
  it("normalises a trailing slash and allows plain http only for localhost", () => {
    const r = readWebsiteConfig({ WEBSITE_ORIGIN: "http://localhost:3000/", WEBSITE_IDENTITY_SECRET: SECRET });
    expect(r.ok && r.config.origin).toBe("http://localhost:3000");
    expect(readWebsiteConfig({ WEBSITE_ORIGIN: "http://www.wuwf.org", WEBSITE_IDENTITY_SECRET: SECRET }).ok).toBe(false);
  });
  it("refuses an origin that could send the token somewhere else", () => {
    for (const bad of ["https://user:pw@www.wuwf.org", "https://www.wuwf.org/admin", "https://www.wuwf.org/?x=1", "https://www.wuwf.org/#x", "javascript:alert(1)", "not a url", "//evil.example"]) {
      expect(readWebsiteConfig({ WEBSITE_ORIGIN: bad, WEBSITE_IDENTITY_SECRET: SECRET }).ok, bad).toBe(false);
    }
  });
  it("names every problem, and never echoes the secret", () => {
    const r = readWebsiteConfig({ WEBSITE_ORIGIN: "", WEBSITE_IDENTITY_SECRET: "short" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems).toEqual(["WEBSITE_ORIGIN is not set", "WEBSITE_IDENTITY_SECRET must be at least 32 characters"]);
      expect(JSON.stringify(r)).not.toContain("short");
    }
  });
});

describe("buildSignInUrl", () => {
  it("points at the fixed sign-in path with the token as the only parameter, encoded", () => {
    const url = new URL(buildSignInUrl("https://www.wuwf.org", "a.b.c&x=1"));
    expect(url.origin).toBe("https://www.wuwf.org");
    expect(url.pathname).toBe("/api/portal/sso");
    expect([...url.searchParams.keys()]).toEqual(["token"]);
    expect(url.searchParams.get("token")).toBe("a.b.c&x=1");
  });
});
