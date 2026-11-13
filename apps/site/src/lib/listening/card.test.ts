import { describe, expect, it } from 'vitest'

import { cardPromise, checkCard, toggleChoice } from './card'

const base = { firstName: 'Dana', contact: '', mayContact: false, mayName: false, keepAnonymous: false }

describe('checkCard', () => {
  it('accepts a first name alone: everything else is optional', () => {
    const checked = checkCard(base)
    expect(checked).toEqual({ ok: true, value: { firstName: 'Dana', contact: null, mayContact: false, mayName: false, keepAnonymous: false }, warning: null })
  })
  it('needs a first name, because the Portal does', () => {
    expect(checkCard({ ...base, firstName: '   ' }).ok).toBe(false)
  })
  it('refuses a name that is too long, and a contact that is too long', () => {
    expect(checkCard({ ...base, firstName: 'x'.repeat(61) }).ok).toBe(false)
    expect(checkCard({ ...base, contact: 'x'.repeat(321) }).ok).toBe(false)
  })
  it('refuses naming and anonymity together', () => {
    expect(checkCard({ ...base, mayName: true, keepAnonymous: true }).ok).toBe(false)
  })
  it('warns, but accepts, contact permission with no way to reach the person', () => {
    const checked = checkCard({ ...base, mayContact: true })
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(checked.warning).toMatch(/no way for a reporter/)
  })
  it('does not warn when a way to be reached is given', () => {
    const checked = checkCard({ ...base, mayContact: true, contact: ' dana@example.com ' })
    expect(checked.ok && checked.warning).toBeNull()
    expect(checked.ok && checked.value.contact).toBe('dana@example.com')
  })
})

describe('toggleChoice', () => {
  it('turning on naming turns off anonymity, and the reverse', () => {
    const anon = { mayContact: true, mayName: false, keepAnonymous: true }
    expect(toggleChoice(anon, 'mayName', true)).toEqual({ mayContact: true, mayName: true, keepAnonymous: false })
    expect(toggleChoice({ mayContact: false, mayName: true, keepAnonymous: false }, 'keepAnonymous', true)).toEqual({ mayContact: false, mayName: false, keepAnonymous: true })
  })
  it('turning one off leaves the others alone', () => {
    expect(toggleChoice({ mayContact: true, mayName: true, keepAnonymous: false }, 'mayContact', false)).toEqual({ mayContact: false, mayName: true, keepAnonymous: false })
  })
})

describe('cardPromise', () => {
  it('promises anonymity when asked, even if contact is allowed', () => {
    expect(cardPromise({ mayContact: true, mayName: false, keepAnonymous: true })).toMatch(/keep you anonymous/)
  })
  it('promises contact only before use, and naming only if allowed', () => {
    expect(cardPromise({ mayContact: true, mayName: false, keepAnonymous: false })).toMatch(/won’t be named/)
    expect(cardPromise({ mayContact: true, mayName: true, keepAnonymous: false })).toMatch(/may name you/)
  })
  it('promises no contact when none was asked for', () => {
    expect(cardPromise({ mayContact: false, mayName: false, keepAnonymous: false })).toMatch(/won’t be/)
  })
})
