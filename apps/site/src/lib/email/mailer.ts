/**
 * Transactional email from the site (phase 7c: the membership claim). Resend, WUWF's mail service, called over its HTTP API
 * (no SDK), behind this small interface so it can be replaced and tested.
 *
 *   RESEND_API_KEY     a Resend key with sending access only (server only; never in the repository)
 *   RESEND_FROM_EMAIL  the sender, on WUWF's verified sending domain, e.g. "WUWF Member Services <members@wuwf.org>"
 *
 * Unset, sending fails with a plain "not set up" answer, which the caller turns into a message for staff. Sign-in emails are not
 * sent from here: Supabase sends those through Resend's SMTP (phase 7b).
 */
export interface Mail {
  to: string
  subject: string
  text: string
}

export type MailResult = { ok: true } | { ok: false; reason: 'not-configured' | 'failed' }

export interface Mailer {
  isConfigured(): boolean
  send(mail: Mail): Promise<MailResult>
}

export const resendMailer: Mailer = {
  isConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
  async send(mail) {
    const key = process.env.RESEND_API_KEY
    const from = process.env.RESEND_FROM_EMAIL
    if (!key || !from) return { ok: false, reason: 'not-configured' }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) return { ok: true }
      // Never log the recipient or the message; the status is enough to diagnose.
      console.error(`Resend refused an email: HTTP ${res.status}`)
      return { ok: false, reason: 'failed' }
    } catch {
      console.error('Resend could not be reached.')
      return { ok: false, reason: 'failed' }
    }
  },
}

/** The mailer in use. Tests replace it; nothing else should. */
let current: Mailer = resendMailer
export const mailer = (): Mailer => current
export function setMailerForTests(m: Mailer | null): void {
  current = m ?? resendMailer
}
