import { createHmac } from 'node:crypto'

/** A key for one job, derived from the site secret, so no new secret is needed (the community calendar does the same). */
export function derivedSecret(label: string): string {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is not set.')
  return createHmac('sha256', secret).update(label).digest('hex')
}
