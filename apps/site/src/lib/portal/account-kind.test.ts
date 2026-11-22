import { describe, expect, it } from 'vitest'

import { PORTAL_LINKED, PORTAL_NOT_LINKED, portalLinkLabel } from './account-kind'

describe('portalLinkLabel', () => {
  it('says linked for an account tied to a Portal profile', () => {
    expect(portalLinkLabel('a1b2c3')).toBe(PORTAL_LINKED)
  })
  it('says none, with its password, for the break-glass administrator and any account made by hand', () => {
    for (const unlinked of [null, '', undefined]) expect(portalLinkLabel(unlinked), String(unlinked)).toBe(PORTAL_NOT_LINKED)
    expect(PORTAL_NOT_LINKED).toContain('local password')
  })
})
