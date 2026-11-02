import { describe, expect, it } from "vitest";
import {
  CLOCK_SKEW_SECONDS, CONTRACT_PATHS, CONTRACT_VERSION, MAX_TOKEN_LIFETIME_SECONDS, REQUEST_WINDOW_SECONDS, SIGNATURE_HEADER, TIMESTAMP_HEADER,
  can, fromBase64Url, mintIdentityToken, normalizeRoles, permissionsFor, signRequest, toBase64Url, verifyIdentityToken, verifyRequestSignature,
} from "./index";

const SECRET = "a".repeat(40);
const OTHER = "b".repeat(40);
const NOW = 1_800_000_000;
const user = { userId: "11111111-1111-4111-8111-111111111111", email: "reporter@wuwf.org", name: "Leigh Ostrander", roles: ["editor", "publisher"] };

function tamper(token: string, part: 0 | 1 | 2, edit: (decoded: string) => string): string {
  const parts = token.split(".");
  const bytes = fromBase64Url(parts[part]!)!;
  parts[part] = toBase64Url(new TextEncoder().encode(edit(new TextDecoder().decode(bytes))));
  return parts.join(".");
}

describe("base64url", () => {
  it("round-trips bytes and rejects characters outside the alphabet", () => {
    const bytes = Uint8Array.from([0, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    expect(fromBase64Url("ab+/")).toBeNull();
    expect(fromBase64Url("a b")).toBeNull();
  });
});

describe("identity token", () => {
  it("round-trips the claims a Payload user is provisioned from", async () => {
    const token = await mintIdentityToken({ ...user, now: NOW, jti: "jti-12345678" }, SECRET);
    const r = await verifyIdentityToken(token, SECRET, NOW + 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims).toMatchObject({ iss: "wuwf-portal", aud: "wuwf-site", sub: user.userId, email: user.email, name: user.name, roles: ["editor", "publisher"], jti: "jti-12345678", exp: NOW + 60 });
    }
  });

  it("gives every token its own jti, so the site can refuse a replay", async () => {
    const a = await mintIdentityToken({ ...user, now: NOW }, SECRET);
    const b = await mintIdentityToken({ ...user, now: NOW }, SECRET);
    const ja = JSON.parse(atob(a.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).jti;
    const jb = JSON.parse(atob(b.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).jti;
    expect(ja).not.toBe(jb);
  });

  it("is never valid for longer than the maximum, whatever the caller asks for", async () => {
    const token = await mintIdentityToken({ ...user, now: NOW, lifetimeSeconds: 86_400 }, SECRET);
    const r = await verifyIdentityToken(token, SECRET, NOW);
    expect(r.ok && r.claims.exp - r.claims.iat).toBe(MAX_TOKEN_LIFETIME_SECONDS);
  });

  it("expires", async () => {
    const token = await mintIdentityToken({ ...user, now: NOW, lifetimeSeconds: 60 }, SECRET);
    expect(await verifyIdentityToken(token, SECRET, NOW + 60)).toMatchObject({ ok: true });
    expect(await verifyIdentityToken(token, SECRET, NOW + 61)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a token minted in the future beyond clock skew, and tolerates a little", async () => {
    const token = await mintIdentityToken({ ...user, now: NOW }, SECRET);
    expect(await verifyIdentityToken(token, SECRET, NOW - CLOCK_SKEW_SECONDS)).toMatchObject({ ok: true });
    expect(await verifyIdentityToken(token, SECRET, NOW - CLOCK_SKEW_SECONDS - 1)).toEqual({ ok: false, reason: "not_yet_valid" });
  });

  it("refuses the wrong secret and any edit to the payload", async () => {
    const token = await mintIdentityToken({ ...user, now: NOW }, SECRET);
    expect(await verifyIdentityToken(token, OTHER, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    const escalated = tamper(token, 1, (p) => p.replace('"editor"', '"administrator"'));
    expect(await verifyIdentityToken(escalated, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("does not let the token choose its own algorithm", async () => {
    const token = await mintIdentityToken({ ...user, now: NOW }, SECRET);
    const none = tamper(token, 0, () => JSON.stringify({ alg: "none", typ: "JWT" }));
    expect(await verifyIdentityToken(none, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    const unsigned = `${none.split(".").slice(0, 2).join(".")}.`;
    expect(await verifyIdentityToken(unsigned, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses malformed input without throwing", async () => {
    for (const bad of ["", "a.b", "a.b.c.d", "!!.!!.!!", "e30.e30.e30"]) {
      const r = await verifyIdentityToken(bad, SECRET, NOW);
      expect(r.ok, bad).toBe(false);
    }
  });

  it("refuses a short secret rather than signing with a weak one", async () => {
    await expect(mintIdentityToken({ ...user, now: NOW }, "short")).rejects.toThrow(/at least 32/);
  });

  it("drops roles the site does not know and keeps a stable order", () => {
    expect(normalizeRoles(["publisher", "root", "editor", "editor", ""])).toEqual(["editor", "publisher"]);
  });
});

describe("role permissions", () => {
  it("stack as a union", () => {
    expect(permissionsFor(["editor", "sponsorship"])).toEqual(["content.write", "listening.review", "sponsorship.manage"]);
  });
  it("let an editor write but not publish; a publisher both", () => {
    expect(can(["editor"], "content.write")).toBe(true);
    expect(can(["editor"], "content.publish")).toBe(false);
    expect(can(["publisher"], "content.publish")).toBe(true);
  });
  it("keep sponsorship and membership separate from editorial", () => {
    expect(can(["sponsorship"], "content.write")).toBe(false);
    expect(can(["membership"], "sponsorship.manage")).toBe(false);
  });
  it("give an administrator everything, and nobody with no roles anything", () => {
    expect(permissionsFor(["administrator"]).length).toBeGreaterThanOrEqual(7);
    expect(permissionsFor([])).toEqual([]);
    expect(can(["unknown"], "content.write")).toBe(false);
  });
});

describe("request signing", () => {
  const body = JSON.stringify({ title: "x" });
  const req = { method: "post", path: "/api/portal/publish-candidates", body, now: NOW };

  async function headersFor(input = req, secret = SECRET) {
    const h = await signRequest(input, secret);
    return { signature: h[SIGNATURE_HEADER], timestamp: h[TIMESTAMP_HEADER], version: h["x-wuwf-contract-version"] };
  }

  it("verifies what was signed, ignoring method case", async () => {
    const h = await headersFor();
    expect(await verifyRequestSignature({ ...req, method: "POST", ...h }, SECRET, NOW + 10)).toEqual({ ok: true });
  });

  it("refuses a changed body, path or method", async () => {
    const h = await headersFor();
    expect(await verifyRequestSignature({ ...req, body: body + " ", ...h }, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(await verifyRequestSignature({ ...req, path: "/api/portal/other", ...h }, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(await verifyRequestSignature({ ...req, method: "PUT", ...h }, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses the wrong channel secret", async () => {
    const h = await headersFor();
    expect(await verifyRequestSignature({ ...req, ...h }, OTHER, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a replay outside the window, and a forged timestamp", async () => {
    const h = await headersFor();
    expect(await verifyRequestSignature({ ...req, ...h }, SECRET, NOW + REQUEST_WINDOW_SECONDS)).toEqual({ ok: true });
    expect(await verifyRequestSignature({ ...req, ...h }, SECRET, NOW + REQUEST_WINDOW_SECONDS + 1)).toEqual({ ok: false, reason: "outside_window" });
    // moving the timestamp into the window breaks the signature, which covers it
    expect(await verifyRequestSignature({ ...req, ...h, timestamp: String(NOW + 400) }, SECRET, NOW + 400)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("names what is wrong with missing or unsupported headers", async () => {
    const h = await headersFor();
    expect(await verifyRequestSignature({ ...req, ...h, signature: null }, SECRET, NOW)).toEqual({ ok: false, reason: "missing_headers" });
    expect(await verifyRequestSignature({ ...req, ...h, version: "99" }, SECRET, NOW)).toEqual({ ok: false, reason: "unsupported_version" });
    expect(await verifyRequestSignature({ ...req, ...h, timestamp: "soon" }, SECRET, NOW)).toEqual({ ok: false, reason: "bad_timestamp" });
    expect(await verifyRequestSignature({ ...req, ...h, signature: "***" }, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(h.version).toBe(CONTRACT_VERSION);
  });
});

describe("contract paths", () => {
  it("are absolute, distinct, and under /api so they never collide with a page", () => {
    const paths = Object.values(CONTRACT_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(p).toMatch(/^\/api\/(portal|site)\/[a-z-]+$/);
  });
});
