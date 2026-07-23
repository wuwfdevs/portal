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
 */
export function getSiteUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
