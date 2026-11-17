import { describe, expect, it, vi } from 'vitest'

import type { Mail, Mailer } from '@/lib/email/mailer'
import { issueFormToken } from '@/lib/events/abuse'

import { processInquiry } from './submit'

const SECRET = 'a'.repeat(40)
const raw = { name: 'Pat', organization: 'Example Co', email: 'pat@example.com', phone: '', interests: ['The Carpool Plan'], budget: 'Not sure yet', message: '' }
const choices = { interests: ['The Carpool Plan', 'Not sure yet'], budgets: ['Not sure yet', 'Under $1,000'] }
const issued = new Date('2026-11-17T12:00:00Z')
const later = new Date(issued.getTime() + 60_000)
const token = issueFormToken(issued, SECRET)

function mailerThatSends(result: 'ok' | 'failed' | 'unset' = 'ok') {
  const sent: Mail[] = []
  const m: Mailer = {
    isConfigured: () => result !== 'unset',
    send: vi.fn(async (mail: Mail) => {
      sent.push(mail)
      return result === 'ok' ? ({ ok: true } as const) : ({ ok: false, reason: 'failed' } as const)
    }),
  }
  return { m, sent }
}

const run = (over: Partial<Parameters<typeof processInquiry>[0]> = {}, deps: Partial<Parameters<typeof processInquiry>[1]> = {}) =>
  processInquiry({ raw, token, honeypot: '', now: later, ...over }, { tokenSecret: SECRET, recipient: 'support@example.org', choices, mailer: mailerThatSends().m, ...deps })

describe('processInquiry', () => {
  it('mails a good inquiry to corporate support, replying to the sender, and says what they chose', async () => {
    const { m, sent } = mailerThatSends()
    expect(await run({}, { mailer: m })).toEqual({ kind: 'ok', chosen: 'The Carpool Plan' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: 'support@example.org', replyTo: 'pat@example.com', subject: 'Sponsorship inquiry: Example Co' })
  })
  it('sends nothing for a bot that fills the hidden field, and does not tell it so', async () => {
    const { m } = mailerThatSends()
    expect((await run({ honeypot: 'http://spam.test' }, { mailer: m })).kind).toBe('ok')
    expect(m.send).not.toHaveBeenCalled()
  })
  it('refuses a form sent too fast, a forged token and an old one, sending nothing', async () => {
    const { m } = mailerThatSends()
    expect((await run({ now: new Date(issued.getTime() + 500) }, { mailer: m })).kind).toBe('too-fast')
    expect((await run({ token: 'nope' }, { mailer: m })).kind).toBe('form-expired')
    expect((await run({ now: new Date(issued.getTime() + 7 * 3_600_000) }, { mailer: m })).kind).toBe('form-expired')
    expect(m.send).not.toHaveBeenCalled()
  })
  it('names what is wrong and sends nothing', async () => {
    const { m } = mailerThatSends()
    const out = await run({ raw: { ...raw, email: 'x' } }, { mailer: m })
    expect(out).toMatchObject({ kind: 'invalid', errors: { email: expect.any(String) } })
    expect(m.send).not.toHaveBeenCalled()
  })
  it('says plainly when no recipient or mail service is set up, rather than pretending to send', async () => {
    expect((await run({}, { recipient: null })).kind).toBe('not-set-up')
    expect((await run({}, { mailer: mailerThatSends('unset').m })).kind).toBe('not-set-up')
  })
  it('reports a refused send as a failure, not a success', async () => {
    expect((await run({}, { mailer: mailerThatSends('failed').m })).kind).toBe('failed')
  })
})
