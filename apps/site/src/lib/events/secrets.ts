import { createHmac } from 'node:crypto'

import { issueFormToken } from './abuse'

/** Two separate keys for two jobs, both derived from the site secret: signing the form's timing token and hashing a client address. */
const derive = (label: string): string => {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is not set.')
  return createHmac('sha256', secret).update(label).digest('hex')
}

export const submissionSecrets = (): { token: string; client: string } => ({ token: derive('community-calendar-form-token'), client: derive('community-calendar-client') })

/** A fresh timing token for a form being shown now. */
export const formTokenFor = (now: Date = new Date()): string => issueFormToken(now, submissionSecrets().token)
