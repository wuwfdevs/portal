import { describe, expect, it } from "vitest";
import { resolveRedirectOrigin } from "./site-url";

const ALLOWED = ["wuwftools.vercel.app", "wuwftools-abc123.vercel.app", "localhost:3000"];
const FALLBACK = "https://wuwftools.vercel.app";

describe("resolveRedirectOrigin", () => {
  it("returns to the deployment-specific host the request came in on", () => {
    // The bug this exists for: signing in on a deployment URL used to send
    // an email pointing at the stable alias, where the PKCE code_verifier
    // cookie doesn't exist — reported to the user as an expired link.
    expect(resolveRedirectOrigin("wuwftools-abc123.vercel.app", "https", ALLOWED, FALLBACK)).toBe(
      "https://wuwftools-abc123.vercel.app",
    );
  });

  it("returns to the stable host when that's where the request came from", () => {
    expect(resolveRedirectOrigin("wuwftools.vercel.app", "https", ALLOWED, FALLBACK)).toBe(
      "https://wuwftools.vercel.app",
    );
  });

  it("ignores a host that isn't ours", () => {
    // A Host header is caller-controlled and this URL is emailed to a user,
    // so an unrecognized host must never end up in the link.
    expect(resolveRedirectOrigin("evil.example.com", "https", ALLOWED, FALLBACK)).toBe(FALLBACK);
    expect(
      resolveRedirectOrigin("wuwftools.vercel.app.evil.example.com", "https", ALLOWED, FALLBACK),
    ).toBe(FALLBACK);
  });

  it("falls back when there's no host header at all", () => {
    expect(resolveRedirectOrigin(null, "https", ALLOWED, FALLBACK)).toBe(FALLBACK);
    expect(resolveRedirectOrigin(undefined, undefined, ALLOWED, FALLBACK)).toBe(FALLBACK);
    expect(resolveRedirectOrigin("", "https", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  it("keeps local development on http", () => {
    expect(resolveRedirectOrigin("localhost:3000", null, ALLOWED, FALLBACK)).toBe(
      "http://localhost:3000",
    );
  });

  it("honors the forwarded protocol over the local-host default", () => {
    expect(resolveRedirectOrigin("localhost:3000", "https", ALLOWED, FALLBACK)).toBe(
      "https://localhost:3000",
    );
  });

  it("assumes https for a deployed host with no forwarded protocol", () => {
    expect(resolveRedirectOrigin("wuwftools.vercel.app", null, ALLOWED, FALLBACK)).toBe(
      "https://wuwftools.vercel.app",
    );
  });

  it("falls back when nothing is allowlisted", () => {
    expect(resolveRedirectOrigin("wuwftools.vercel.app", "https", [], FALLBACK)).toBe(FALLBACK);
  });
});
