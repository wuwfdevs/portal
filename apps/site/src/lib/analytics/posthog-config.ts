// Where PostHog lives and how the site reaches it. Pure and free of imports, so `next.config.ts` can read it.
//
// The browser never talks to PostHog's hosts: every request goes to this site under `RELAY_PATH`, and Next's rewrites pass it on (PostHog's
// "Next.js rewrites reverse proxy" guide). That keeps the traffic first party, needs no new script or connect origin, and is not lost to
// blockers that filter by domain. The name is deliberately not "analytics" or "posthog": blockers match those. It is a reserved first segment
// (`lib/paths.ts`), so no page can take it.
//
// Cost (PostHog's guide): this routes events and session recordings through Vercel, which counts toward Fast Data Transfer. If that grows,
// PostHog's free managed reverse proxy (a subdomain of wuwf.org pointed at PostHog by DNS) replaces these rewrites: change `api_host` only.

export const RELAY_PATH = '/relay'

/** PostHog US Cloud (the owner's choice, 2026-11-26). */
export const POSTHOG_INGEST_HOST = 'https://us.i.posthog.com'
export const POSTHOG_ASSETS_HOST = 'https://us-assets.i.posthog.com'
export const POSTHOG_UI_HOST = 'https://us.posthog.com'

/** The rewrites, most specific first: Next tries them in order, and the catch-all would swallow the asset paths. */
export const posthogRewrites = () => [
  { source: `${RELAY_PATH}/static/:path*`, destination: `${POSTHOG_ASSETS_HOST}/static/:path*` },
  { source: `${RELAY_PATH}/array/:path*`, destination: `${POSTHOG_ASSETS_HOST}/array/:path*` },
  { source: `${RELAY_PATH}/:path*`, destination: `${POSTHOG_INGEST_HOST}/:path*` },
]

/**
 * PostHog's API paths end in a slash (`/e/`, `/flags/`), and Next answers a trailing slash with a 308 to the path without one, so the
 * config turns that off (`skipTrailingSlashRedirect`) and this redirect puts it back for every address except the relay's: a trailing slash
 * still goes, permanently, to the address without one, as before.
 */
export const trailingSlashRedirect = () => ({
  source: `/:path((?!${RELAY_PATH.slice(1)}/).+)/`,
  destination: '/:path',
  permanent: true,
})
