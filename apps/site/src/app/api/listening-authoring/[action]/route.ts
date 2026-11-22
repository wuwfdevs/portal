import configPromise from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import { userCan } from '@/access/permissions'
import { BROWSER_ACTIONS, portalBodyFor } from '@/lib/listening/authoring-request'
import { callStaffActionWith } from '@/lib/portal-staff/call'
import { getStaffActionsConfig } from '@/lib/portal-staff/server'

/**
 * What the block editor's "Listening question" field calls to list, read, write, open and close a query. It is the site's server speaking to
 * the Portal's signed staff actions API for the signed-in person: the browser never holds the secret, and never says who it is. The actor sent to
 * the Portal is the Portal user id this person signed in with; someone without one (the break-glass administrator) is refused here, and the
 * Portal checks the actor's grant again itself. Nothing is stored on this site.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }
const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: NO_STORE })

const STATUS: Record<string, number> = { not_allowed: 403, not_found: 404, invalid: 400, conflict: 409, rate_limited: 429, unavailable: 502, not_set_up: 503 }
const SAY: Record<string, string> = {
  not_allowed: 'Your Portal account does not have Audience Listening, so you cannot write a listening question here.',
  not_found: 'That question could not be found in the Portal.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  unavailable: 'The Portal could not be reached just now. Nothing was changed; try again in a minute.',
  not_set_up: 'Writing listening questions here is not set up on this server yet. The Portal address and the authoring secret are missing.',
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await context.params
  const spec = Object.hasOwn(BROWSER_ACTIONS, action) ? BROWSER_ACTIONS[action] : undefined
  if (!spec) return json(404, { ok: false, error: 'not_found', message: 'Not found.' })

  // A call from this site's own admin only: JSON, and from the same origin when the browser says where it came from.
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json(415, { ok: false, error: 'invalid', message: 'Expected JSON.' })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return json(403, { ok: false, error: 'not_allowed', message: 'That request did not come from this site.' })

  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user || !userCan(user as { roles?: string[] }, 'listening.review')) return json(403, { ok: false, error: 'not_allowed', message: 'You do not have permission to write listening questions.' })
  const portalUserId = (user as { portalUserId?: string | null }).portalUserId
  if (!portalUserId) {
    return json(403, { ok: false, error: 'not_allowed', message: 'Sign in to the website through the Portal to write listening questions: this account has no Portal identity.' })
  }

  let browser: unknown = {}
  if (spec.action !== 'list') {
    try {
      browser = await request.json()
    } catch {
      return json(400, { ok: false, error: 'invalid', message: 'The request could not be read.' })
    }
  }
  const body = portalBodyFor(spec.action, browser, portalUserId)
  if (!body) return json(400, { ok: false, error: 'invalid', message: 'The request could not be read.' })

  const result = await callStaffActionWith<Record<string, unknown>>(await getStaffActionsConfig(), fetch, spec.path, body)
  if (result.ok) return json(200, result)
  return json(STATUS[result.error] ?? 502, { ok: false, error: result.error, message: result.message ?? SAY[result.error] ?? SAY.unavailable })
}
