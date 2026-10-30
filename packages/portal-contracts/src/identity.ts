// Contract 1 — identity. The Portal is the identity provider for the CMS admin. Opening the website
// tool mints a short-lived token; the site verifies it, provisions or updates the matching Payload
// user, and maps the roles onto its own access control.
//
// The token is a standard HS256 JWT so it can be inspected, but it is verified strictly: the
// algorithm is fixed (never read from the header), and the issuer, audience, lifetime and clock
// skew are all checked. One-time use (the `jti`) needs state, so recording a seen jti is the
// site's job; this module only guarantees every token has one.

import { fromBase64Url, fromUtf8, hmacSha256, hmacSha256Verify, toBase64Url, utf8 } from "./encoding";

export const IDENTITY_ISSUER = "wuwf-portal";
export const IDENTITY_AUDIENCE = "wuwf-site";
/** A token is only good for long enough to follow a redirect. */
export const MAX_TOKEN_LIFETIME_SECONDS = 120;
export const CLOCK_SKEW_SECONDS = 30;

/** The website tool's stacking roles (tool_access.tool_roles). */
export const SITE_ROLES = ["editor", "publisher", "administrator", "sponsorship", "membership"] as const;
export type SiteRole = (typeof SITE_ROLES)[number];

export interface IdentityClaims {
  iss: typeof IDENTITY_ISSUER;
  aud: typeof IDENTITY_AUDIENCE;
  /** The Portal profile id. */
  sub: string;
  email: string;
  name: string;
  roles: SiteRole[];
  iat: number;
  exp: number;
  jti: string;
}

export interface MintInput {
  userId: string;
  email: string;
  name: string;
  roles: readonly string[];
  /** Seconds since the epoch; injectable for tests. */
  now?: number;
  lifetimeSeconds?: number;
  jti?: string;
}

export function isSiteRole(value: string): value is SiteRole {
  return (SITE_ROLES as readonly string[]).includes(value);
}

/** Keeps only roles the site knows, in a stable order, without duplicates. */
export function normalizeRoles(roles: readonly string[]): SiteRole[] {
  const set = new Set(roles.filter(isSiteRole));
  return SITE_ROLES.filter((r) => set.has(r));
}

function newJti(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function mintIdentityToken(input: MintInput, secret: string): Promise<string> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const lifetime = Math.min(input.lifetimeSeconds ?? 60, MAX_TOKEN_LIFETIME_SECONDS);
  if (lifetime <= 0) throw new Error("Token lifetime must be positive");
  const claims: IdentityClaims = {
    iss: IDENTITY_ISSUER,
    aud: IDENTITY_AUDIENCE,
    sub: input.userId,
    email: input.email,
    name: input.name,
    roles: normalizeRoles(input.roles),
    iat: now,
    exp: now + lifetime,
    jti: input.jti ?? newJti(),
  };
  const header = toBase64Url(utf8(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = toBase64Url(utf8(JSON.stringify(claims)));
  const signature = toBase64Url(await hmacSha256(secret, `${header}.${payload}`));
  return `${header}.${payload}.${signature}`;
}

export type IdentityFailure = "malformed" | "bad_signature" | "wrong_issuer" | "wrong_audience" | "expired" | "not_yet_valid" | "too_long_lived" | "invalid_claims";

export type VerifyResult = { ok: true; claims: IdentityClaims } | { ok: false; reason: IdentityFailure };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function verifyIdentityToken(token: string, secret: string, now: number = Math.floor(Date.now() / 1000)): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [h, p, s] = parts as [string, string, string];
  const headerBytes = fromBase64Url(h);
  const payloadBytes = fromBase64Url(p);
  const sigBytes = fromBase64Url(s);
  if (!headerBytes || !payloadBytes || !sigBytes) return { ok: false, reason: "malformed" };

  let header: unknown;
  try {
    header = JSON.parse(fromUtf8(headerBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  // The algorithm is fixed by this contract. Never trust the header to choose it ("alg: none" and key confusion).
  if (typeof header !== "object" || header === null || (header as { alg?: unknown }).alg !== "HS256") return { ok: false, reason: "malformed" };

  if (!(await hmacSha256Verify(secret, `${h}.${p}`, sigBytes))) return { ok: false, reason: "bad_signature" };

  let c: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(fromUtf8(payloadBytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ok: false, reason: "malformed" };
    c = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (c.iss !== IDENTITY_ISSUER) return { ok: false, reason: "wrong_issuer" };
  if (c.aud !== IDENTITY_AUDIENCE) return { ok: false, reason: "wrong_audience" };
  if (typeof c.sub !== "string" || c.sub === "" || typeof c.email !== "string" || !EMAIL.test(c.email) || typeof c.name !== "string" || typeof c.jti !== "string" || c.jti.length < 8 || !Array.isArray(c.roles) || !c.roles.every((r) => typeof r === "string") || typeof c.iat !== "number" || typeof c.exp !== "number")
    return { ok: false, reason: "invalid_claims" };

  if (c.exp - c.iat > MAX_TOKEN_LIFETIME_SECONDS) return { ok: false, reason: "too_long_lived" };
  if (now > c.exp) return { ok: false, reason: "expired" };
  if (c.iat > now + CLOCK_SKEW_SECONDS) return { ok: false, reason: "not_yet_valid" };

  return {
    ok: true,
    claims: {
      iss: IDENTITY_ISSUER, aud: IDENTITY_AUDIENCE, sub: c.sub, email: c.email, name: c.name,
      roles: normalizeRoles(c.roles as string[]), iat: c.iat, exp: c.exp, jti: c.jti,
    },
  };
}

/** What each role may do in the CMS. Roles stack: a person holds the union. */
export const SITE_PERMISSIONS = [
  "content.write",
  "content.publish",
  "listening.review",
  "sponsorship.manage",
  "membership.manage",
  "settings.manage",
  "users.manage",
] as const;
export type SitePermission = (typeof SITE_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<SiteRole, readonly SitePermission[]> = {
  editor: ["content.write", "listening.review"],
  publisher: ["content.write", "content.publish", "listening.review"],
  sponsorship: ["sponsorship.manage"],
  membership: ["membership.manage"],
  administrator: [...SITE_PERMISSIONS],
};

export function permissionsFor(roles: readonly string[]): SitePermission[] {
  const held = new Set<SitePermission>();
  for (const role of normalizeRoles(roles)) for (const p of ROLE_PERMISSIONS[role]) held.add(p);
  return SITE_PERMISSIONS.filter((p) => held.has(p));
}

export function can(roles: readonly string[], permission: SitePermission): boolean {
  return permissionsFor(roles).includes(permission);
}
