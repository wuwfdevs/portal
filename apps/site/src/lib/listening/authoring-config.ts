import { LISTENING_AUTHORING_SECRET_MIN_LENGTH } from '@wuwf/portal-contracts'

import { parseBypassSecret, parsePortalOrigin } from './config'

/**
 * Where the Portal's listening AUTHORING API is and the secret that signs the calls to it (contract 4, `@wuwf/portal-contracts`
 * `listening-authoring.ts`). The address and the protection bypass are the listening channel's (one Portal); the secret is this channel's own,
 * `PORTAL_LISTENING_AUTHORING_SECRET`, equal to the Portal's `LISTENING_AUTHORING_SECRET`: a leak of the listening secret cannot write a query.
 * Missing or wrong means authoring is "not set up on this server yet": the editor's field says so and sends nothing.
 */
export interface AuthoringConfig {
  origin: string
  secret: string
  bypass?: string
}

export function readAuthoringConfig(env: Record<string, string | undefined> = process.env, setting?: string | null): AuthoringConfig | null {
  const secret = env.PORTAL_LISTENING_AUTHORING_SECRET
  if (!secret || secret.length < LISTENING_AUTHORING_SECRET_MIN_LENGTH) return null
  const chosen = setting?.trim() || env.PORTAL_ORIGIN?.trim()
  if (!chosen) return null
  const origin = parsePortalOrigin(chosen)
  if (!origin) return null
  const bypass = parseBypassSecret(env.PORTAL_PROTECTION_BYPASS)
  return { origin, secret, ...(bypass ? { bypass } : {}) }
}
