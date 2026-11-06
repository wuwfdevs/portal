// The staging-only scripts (repairing files after the rehearsal) must not be able to run against any other hosted database, by
// a wrong DATABASE_URL pasted into the wrong terminal or any other mistake. So this is an allow-list of ONE project, not a
// block-list: anything that is not provably staging is refused, and the message names only what was found, never the password.

/** The staging project's reference (a public identifier, not a secret). Supabase puts it in the pooler user ("role.<ref>") or in the host ("db.<ref>.supabase.co"). */
export const STAGING_PROJECT_REF = 'avgeycgvaufwdfzdsogi'

export type GuardResult = { ok: true; where: 'staging' | 'this machine' } | { ok: false; reason: string }

export function checkStagingDatabase(databaseUrl: string | undefined, opts: { allowLocal?: boolean } = {}): GuardResult {
  if (!databaseUrl) return { ok: false, reason: 'DATABASE_URL is not set.' }
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    return { ok: false, reason: 'DATABASE_URL is not a valid address.' }
  }
  const host = url.hostname.toLowerCase()
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    return opts.allowLocal ? { ok: true, where: 'this machine' } : { ok: false, reason: 'DATABASE_URL points at this machine; this script is for the staging database (pass --local-rehearsal to test it on a scratch database).' }
  }
  const user = decodeURIComponent(url.username).toLowerCase()
  // Only a real Supabase address counts: the ref in the pooler login of a Supabase pooler host, or the project's own host.
  const supabaseHost = /\.supabase\.(com|co)$/.test(host)
  const inUser = supabaseHost && user.split('.').slice(1).includes(STAGING_PROJECT_REF)
  const inHost = host === `db.${STAGING_PROJECT_REF}.supabase.co`
  if (inUser || inHost) return { ok: true, where: 'staging' }
  return { ok: false, reason: `DATABASE_URL is for host "${host}", which is not the staging project. This script only runs against staging.` }
}

/** The production project's reference (public, like staging's). */
export const PRODUCTION_PROJECT_REF = 'gyidqxhkkhajfazbcrug'

export type SiteGuardResult = { ok: true; where: 'staging' | 'production' | 'this machine' } | { ok: false; reason: string }

/**
 * For the few scripts that must run on staging first and then, deliberately, on production (moving shows to /shows): an allow-list of
 * the site's two projects. Production only when the caller passes `allowProduction` (the script's own `--production` flag), so a
 * production address in the wrong terminal is still refused. Anything else hosted is refused.
 */
export function checkSiteDatabase(databaseUrl: string | undefined, opts: { allowLocal?: boolean; allowProduction?: boolean } = {}): SiteGuardResult {
  const staging = checkStagingDatabase(databaseUrl, { allowLocal: opts.allowLocal })
  if (staging.ok) return staging
  if (!databaseUrl) return staging
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    return staging
  }
  const host = url.hostname.toLowerCase()
  const user = decodeURIComponent(url.username).toLowerCase()
  const supabaseHost = /\.supabase\.(com|co)$/.test(host)
  const isProduction = (supabaseHost && user.split('.').slice(1).includes(PRODUCTION_PROJECT_REF)) || host === `db.${PRODUCTION_PROJECT_REF}.supabase.co`
  if (!isProduction) return { ok: false, reason: staging.reason.replace('This script only runs against staging.', 'This script only runs against the site\'s staging or production project.') }
  return opts.allowProduction ? { ok: true, where: 'production' } : { ok: false, reason: 'DATABASE_URL is the PRODUCTION project. Run on staging first; to run on production, pass --production as well.' }
}
