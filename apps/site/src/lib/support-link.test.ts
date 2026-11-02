import { describe, expect, it } from 'vitest'

import { isAllowedSupportHref, supportHref, validateSupportHref } from './support-link'

describe('isAllowedSupportHref', () => {
  it.each(['/shows/barefoot-mary', '/support#give', 'https://give.example.org/form?fund=news', 'mailto:giving@example.org'])(
    'allows %s',
    (value) => expect(isAllowedSupportHref(value)).toBe(true),
  )

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://insecure.example.org',
    '//evil.example.org/x',
    '/\\evil.example.org',
    'https://localhost',
    'https://exa mple.org',
    'mailto:',
    'ftp://example.org',
    'give',
    '',
  ])('refuses %j', (value) => expect(isAllowedSupportHref(value)).toBe(false))
})

describe('supportHref', () => {
  it('trims and returns a safe value', () => expect(supportHref('  /support ')).toBe('/support'))
  it('returns null for empty, missing or unsafe values', () => {
    expect(supportHref(null)).toBeNull()
    expect(supportHref(undefined)).toBeNull()
    expect(supportHref('')).toBeNull()
    expect(supportHref('javascript:alert(1)')).toBeNull()
  })
})

describe('validateSupportHref', () => {
  it('accepts empty (the button is hidden)', () => {
    expect(validateSupportHref(undefined)).toBe(true)
    expect(validateSupportHref('')).toBe(true)
  })
  it('explains a refusal', () => expect(typeof validateSupportHref('javascript:alert(1)')).toBe('string'))
})
