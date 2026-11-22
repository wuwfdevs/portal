import { STAFF_ACTIONS_SECRET_MIN_LENGTH } from '@wuwf/portal-contracts'

import { parseBypassSecret, parsePortalOrigin } from '../listening/config'

/**
 * Where the Portal's STAFF ACTIONS API is and the secret that signs the calls to it (contract 4, `@wuwf/portal-contracts` `staff-actions.ts`): everything
 * this site does on behalf of a named staff member, such as writing a listening question from the block editor. The address and the protection bypass are
 * the listening channel's (one Portal); the secret is this channel's own, `PORTAL_STAFF_ACTIONS_SECRET`, equal to the Portal's `STAFF_ACTIONS_SECRET`. One
 * secret for every staff action: a new feature adds paths, never a secret. It is never the listening secret (anonymous visitors) or the identity secret.
 * Missing or wrong means staff actions are "not set up on this server yet": the editor's field says so and sends nothing.
 */
export interface StaffActionsConfig {
  origin: string
  secret: string
  bypass?: string
}

export function readStaffActionsConfig(env: Record<string, string | undefined> = process.env, setting?: string | null): StaffActionsConfig | null {
  const secret = env.PORTAL_STAFF_ACTIONS_SECRET
  if (!secret || secret.length < STAFF_ACTIONS_SECRET_MIN_LENGTH) return null
  const chosen = setting?.trim() || env.PORTAL_ORIGIN?.trim()
  if (!chosen) return null
  const origin = parsePortalOrigin(chosen)
  if (!origin) return null
  const bypass = parseBypassSecret(env.PORTAL_PROTECTION_BYPASS)
  return { origin, secret, ...(bypass ? { bypass } : {}) }
}
