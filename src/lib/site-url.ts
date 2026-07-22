/**
 * Base URL used to build auth redirect links (magic link / invite emails).
 * Set NEXT_PUBLIC_SITE_URL explicitly in Production so it points at the real
 * domain. Preview deployments get a fresh URL per build, so absent an
 * explicit override this falls back to Vercel's auto-injected VERCEL_URL —
 * no per-preview configuration needed.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
