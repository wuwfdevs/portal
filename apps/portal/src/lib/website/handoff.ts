// Pure helpers for handing a signed-in staff member to the public site's CMS. The token itself is minted
// by @wuwf/portal-contracts; this decides whether the hand-off is configured safely and where it points.

import { CONTRACT_PATHS } from "@wuwf/portal-contracts";

export interface WebsiteConfig {
  /** The site's origin only, e.g. https://www.wuwf.org */
  origin: string;
  /** Signs the identity token. At least 32 characters; its own secret, shared with no other channel. */
  secret: string;
}

export type WebsiteConfigResult = { ok: true; config: WebsiteConfig } | { ok: false; problems: string[] };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads WEBSITE_ORIGIN and WEBSITE_IDENTITY_SECRET. The origin must be https (plain http only for localhost),
 * with no credentials, path, query or fragment: the token is sent to exactly this origin, so a mistyped or
 * hostile value must not be able to point it anywhere else.
 */
export function readWebsiteConfig(env: { WEBSITE_ORIGIN?: string; WEBSITE_IDENTITY_SECRET?: string }): WebsiteConfigResult {
  const problems: string[] = [];
  const rawOrigin = env.WEBSITE_ORIGIN?.trim();
  let origin = "";
  if (!rawOrigin) problems.push("WEBSITE_ORIGIN is not set");
  else {
    try {
      const url = new URL(rawOrigin);
      const local = LOCAL_HOSTS.has(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) problems.push("WEBSITE_ORIGIN must be https (http is allowed only for localhost)");
      else if (url.username || url.password) problems.push("WEBSITE_ORIGIN must not contain credentials");
      else if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) problems.push("WEBSITE_ORIGIN must be an origin only, with no path, query or fragment");
      else origin = url.origin;
    } catch {
      problems.push("WEBSITE_ORIGIN is not a valid URL");
    }
  }
  const secret = env.WEBSITE_IDENTITY_SECRET ?? "";
  if (secret.length === 0) problems.push("WEBSITE_IDENTITY_SECRET is not set");
  else if (secret.length < 32) problems.push("WEBSITE_IDENTITY_SECRET must be at least 32 characters");
  return problems.length > 0 ? { ok: false, problems } : { ok: true, config: { origin, secret } };
}

/** Where the browser is sent: the site's fixed sign-in path, with the token as its only parameter. */
export function buildSignInUrl(origin: string, token: string): string {
  return `${origin}${CONTRACT_PATHS.identitySignIn}?token=${encodeURIComponent(token)}`;
}
