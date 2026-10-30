/**
 * Base URL used to build auth redirect links (magic link / invite emails).
 *
 * On Vercel, VERCEL_ENV tells us which environment actually built this
 * deployment — trust that over whatever NEXT_PUBLIC_SITE_URL happens to be
 * set to. Preview builds always use Vercel's auto-injected per-deployment
 * VERCEL_URL: Vercel's env var UI requires every variable to have a value,
 * so there's no clean way to leave NEXT_PUBLIC_SITE_URL genuinely unset for
 * Preview — this makes whatever's typed there for Preview irrelevant rather
 * than relying on nobody ever filling it in. Production (and local dev,
 * where VERCEL_ENV is unset) still honors an explicit NEXT_PUBLIC_SITE_URL.
 *
 * This is the right answer for links a *different* person will open — an
 * invite email — and for the webhook URL we hand to AssemblyAI. For the
 * interactive sign-in link, which the same browser has to come back to, use
 * getAuthRedirectOrigin() instead.
 */
export function getSiteUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Hosts a sign-in link is allowed to point back at.
 *
 * Every entry comes from our own build/runtime environment, never from the
 * request — that's what makes the allowlist in resolveRedirectOrigin()
 * meaningful. VERCEL_URL is the immutable per-deployment hostname,
 * VERCEL_BRANCH_URL the branch alias, VERCEL_PROJECT_PRODUCTION_URL the
 * stable production one.
 */
export function allowedRedirectHosts(): string[] {
  return [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    "localhost:3000",
    "127.0.0.1:3000",
  ].flatMap((candidate) => {
    if (!candidate) return [];
    try {
      return [new URL(candidate.includes("://") ? candidate : `https://${candidate}`).host];
    } catch {
      // A malformed NEXT_PUBLIC_SITE_URL shouldn't take sign-in down; it
      // just doesn't earn a place on the allowlist.
      return [];
    }
  });
}

/**
 * Picks the origin a sign-in link should return to.
 *
 * Magic-link sign-in is PKCE: signInWithOtp writes a code_verifier cookie
 * on whatever host the browser is currently on, and /auth/callback has to
 * read that same cookie back. Building the link from environment variables
 * instead breaks the moment those two hosts differ — request a link while
 * browsing a deployment-specific URL and the email points at the stable
 * production alias, where the verifier for this attempt doesn't exist (or,
 * worse, a stale one from an earlier attempt does). The exchange then fails
 * with bad_code_verifier, which the callback reports as an expired link.
 *
 * So: honor the host the request actually came in on, but only if it's one
 * of ours. A Host header is caller-controlled and this URL goes into an
 * email — without the allowlist, a forged header could point someone's
 * sign-in link at an attacker's domain.
 */
export function resolveRedirectOrigin(
  requestHost: string | null | undefined,
  requestProto: string | null | undefined,
  allowedHosts: string[],
  fallback: string,
): string {
  if (!requestHost || !allowedHosts.includes(requestHost)) return fallback;

  const isLocal = requestHost.startsWith("localhost") || requestHost.startsWith("127.0.0.1");
  return `${requestProto || (isLocal ? "http" : "https")}://${requestHost}`;
}

/** resolveRedirectOrigin() wired to the live request. Server-side only. */
export async function getAuthRedirectOrigin(): Promise<string> {
  const { headers } = await import("next/headers");
  const headerList = await headers();

  return resolveRedirectOrigin(
    // Vercel forwards the browser's original host here; `host` is the
    // direct one, which is what local dev sees.
    headerList.get("x-forwarded-host") ?? headerList.get("host"),
    headerList.get("x-forwarded-proto"),
    allowedRedirectHosts(),
    getSiteUrl(),
  );
}
