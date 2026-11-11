import { describe, expect, it } from 'vitest'

import { checkAskMessage, checkHostRequest, looksLikeEmail } from './inbox'

const HOST = {
  name: ' Mary Jones ',
  email: 'mary@example.org',
  kind: 'invite',
  organization: '',
  seats: 12,
  address: ' 12 Palafox Place ',
  expected: '9-12',
  whenText: 'A Saturday in March',
  inviteesText: null,
  journalistRequested: true,
}

describe('looksLikeEmail', () => {
  it('matches the shape the Portal and the database use', () => {
    for (const ok of ['a@b.co', ' a@b.co ', 'first.last+tag@sub.example.org']) expect(looksLikeEmail(ok)).toBe(true)
    for (const bad of ['', 'a', 'a@b', '@b.co', 'a b@c.co', 'a@b .co', `${'x'.repeat(320)}@b.co`]) expect(looksLikeEmail(bad)).toBe(false)
  })
})

describe('checkAskMessage', () => {
  it('trims, and treats a blank email as none', () => {
    expect(checkAskMessage({ kind: 'question', body: '  Why? ', email: '  ' })).toEqual({ ok: true, value: { kind: 'question', body: 'Why?', email: null } })
    expect(checkAskMessage({ kind: 'story_idea', body: 'An idea', email: ' a@b.co ' })).toEqual({ ok: true, value: { kind: 'story_idea', body: 'An idea', email: 'a@b.co' } })
    expect(checkAskMessage({ kind: 'question', body: 'Why?' })).toMatchObject({ ok: true, value: { email: null } })
  })
  it('refuses what the form could not have sent, in words', () => {
    for (const bad of [null, 'text', [], {}, { kind: 'complaint', body: 'x' }, { kind: 'question', body: '   ' }, { kind: 'question', body: 'x'.repeat(2001) }, { kind: 'question', body: 'x', email: 'nope' }, { kind: 'question', body: 'x', email: 5 }]) {
      const result = checkAskMessage(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message.length).toBeGreaterThan(10)
    }
    expect(checkAskMessage({ kind: 'question', body: 'x'.repeat(2000) }).ok).toBe(true)
  })
})

describe('checkHostRequest', () => {
  it('picks and trims every field, with blank optionals as null', () => {
    expect(checkHostRequest(HOST)).toEqual({
      ok: true,
      value: {
        name: 'Mary Jones',
        email: 'mary@example.org',
        kind: 'invite',
        organization: null,
        seats: 12,
        address: '12 Palafox Place',
        expected: '9-12',
        whenText: 'A Saturday in March',
        inviteesText: null,
        journalistRequested: true,
      },
    })
  })
  it('never passes on a field it was not asked for', () => {
    const result = checkHostRequest({ ...HOST, subject: { kind: 'account', id: 'evil' }, clientHash: 'x', extra: 1 })
    expect(result.ok && Object.keys(result.value).sort()).toEqual(
      ['address', 'email', 'expected', 'inviteesText', 'journalistRequested', 'kind', 'name', 'organization', 'seats', 'whenText'],
    )
  })
  it('refuses each missing or malformed field with its own sentence', () => {
    const messages = new Set<string>()
    for (const bad of [
      { ...HOST, name: ' ' },
      { ...HOST, email: '' },
      { ...HOST, email: 'nope' },
      { ...HOST, kind: 'private' },
      { ...HOST, seats: 20 },
      { ...HOST, seats: '12' },
      { ...HOST, expected: '13+' },
      { ...HOST, address: '' },
      { ...HOST, whenText: '' },
      { ...HOST, whenText: 'x'.repeat(501) },
      { ...HOST, organization: 5 },
      { ...HOST, inviteesText: 'x'.repeat(2001) },
      { ...HOST, journalistRequested: 'yes' },
      null,
    ]) {
      const result = checkHostRequest(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) messages.add(result.message)
    }
    expect(messages.size).toBeGreaterThanOrEqual(9)
  })
})
