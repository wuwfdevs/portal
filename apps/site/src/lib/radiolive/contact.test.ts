import { describe, expect, it } from 'vitest'

import { mailtoOf, telOf, validateEmail, validatePhone } from './contact'

describe('mailtoOf', () => {
  it('links one plain address', () => {
    expect(mailtoOf(' name@example.org ')).toBe('mailto:name@example.org')
  })
  it('refuses names, several recipients, queries, markup and nothing', () => {
    for (const bad of ['Name <a@b.org>', 'a@b.org, c@d.org', 'a@b.org?subject=x&cc=y@z.org', 'a@b', '<a@b.org>', 'javascript:alert(1)', '', null, undefined]) expect(mailtoOf(bad as never), String(bad)).toBeNull()
  })
})

describe('telOf', () => {
  it('links a phone number as digits, keeping a leading +', () => {
    expect(telOf('850.473.7433')).toBe('tel:8504737433')
    expect(telOf('(850) 473-7433')).toBe('tel:8504737433')
    expect(telOf('+1 850 473 7433')).toBe('tel:+18504737433')
  })
  it('refuses letters, too few or too many digits and nothing', () => {
    for (const bad of ['call us', '473-7433', '1234567890123456', '850-473-7433 ext 2', 'tel:8504737433', '', null]) expect(telOf(bad as never), String(bad)).toBeNull()
  })
})

describe('validators', () => {
  it('allow empty and say what is wrong otherwise', () => {
    expect(validateEmail('')).toBe(true)
    expect(validateEmail('a@b.org')).toBe(true)
    expect(typeof validateEmail('nope')).toBe('string')
    expect(validatePhone(null)).toBe(true)
    expect(typeof validatePhone('12')).toBe('string')
  })
})
