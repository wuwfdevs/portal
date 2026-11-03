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
