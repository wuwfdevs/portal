import { describe, expect, it } from "vitest";
import {
  JOIN_LINK_DEFAULT_TTL_MS,
  defaultTokenExpiry,
  generateJoinToken,
  isJoinLinkActive,
  storagePrefixFor,
} from "./tokens";

describe("generateJoinToken", () => {
  it("produces a URL-safe, 256-bit-derived token", () => {
    const token = generateJoinToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // base64url of 32 bytes, no padding: 43 characters.
    expect(token.length).toBe(43);
  });

  it("is different every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateJoinToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("storagePrefixFor", () => {
  it("scopes a participant to <session id>/<participant id>", () => {
    expect(storagePrefixFor("session-1", "participant-1")).toBe("session-1/participant-1");
  });
});

describe("defaultTokenExpiry", () => {
  it("is seven days after the given instant", () => {
    const now = new Date("2026-07-29T12:00:00Z");
    expect(defaultTokenExpiry(now).getTime()).toBe(now.getTime() + JOIN_LINK_DEFAULT_TTL_MS);
  });
});

describe("isJoinLinkActive", () => {
  const now = new Date("2026-07-29T12:00:00Z");

  it("is inactive once revoked, regardless of expiry", () => {
    expect(
      isJoinLinkActive(
        { revokedAt: "2026-07-28T00:00:00Z", tokenExpiresAt: "2026-08-01T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("is active with no expiry set, e.g. the host's own unused token", () => {
    expect(isJoinLinkActive({ revokedAt: null, tokenExpiresAt: null }, now)).toBe(true);
  });

  it("is active before expiry and inactive after it", () => {
    expect(isJoinLinkActive({ revokedAt: null, tokenExpiresAt: "2026-08-01T00:00:00Z" }, now)).toBe(
      true,
    );
    expect(isJoinLinkActive({ revokedAt: null, tokenExpiresAt: "2026-07-01T00:00:00Z" }, now)).toBe(
      false,
    );
  });
});
