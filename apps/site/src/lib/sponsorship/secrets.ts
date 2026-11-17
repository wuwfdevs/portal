import { createHmac } from 'node:crypto'

import { issueFormToken } from '@/lib/events/abuse'

/** The key that signs the inquiry form's timing token, derived from the site secret and used for nothing else. */
export const inquiryTokenSecret = (): string => {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is not set.')
  return createHmac('sha256', secret).update('sponsorship-inquiry-form-token').digest('hex')
}

/** A fresh timing token for an inquiry form being shown now. */
export const inquiryTokenFor = (now: Date = new Date()): string => issueFormToken(now, inquiryTokenSecret())
