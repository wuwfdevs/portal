import { describe, expect, it } from 'vitest'

import { givingFooter, sponsorFooter } from './footer'

const nav = [
  { label: 'On air', href: '/sponsor/on-air' },
  { label: 'Credit guidelines', href: '/sponsor/credit-guidelines' },
]

describe('the sponsorship footer line', () => {
  it('says nothing when the settings hold nothing to say', () => {
    expect(sponsorFooter(null, nav)).toBeNull()
    expect(sponsorFooter({ serviceLine: ' ', phone: '', address: null }, nav)).toBeNull()
  })
  it('prints the service line, a phone link built from the digits, the address and the guidelines page by its navigation name', () => {
    const f = sponsorFooter({ serviceLine: 'A service of UWF.', phone: '850 473-7453', address: '11000 University Parkway' }, nav)
    expect(f).toEqual({ serviceLine: 'A service of UWF.', phone: { text: '850 473-7453', href: 'tel:+18504737453' }, address: '11000 University Parkway', link: { label: 'Credit guidelines', href: '/sponsor/credit-guidelines' } })
  })
  it('has no guidelines link when the set has no such page, and no phone link for a phone that is not a number', () => {
    const f = sponsorFooter({ phone: 'ask us' }, [])
    expect(f?.link).toBeNull()
    expect(f?.phone).toEqual({ text: 'ask us', href: null })
  })
})

describe('the giving footer line', () => {
  it('prints the Giving settings’ service line, and nothing when it is empty', () => {
    expect(givingFooter({ serviceLine: ' A service of the University of West Florida. ' })).toBe('A service of the University of West Florida.')
    expect(givingFooter({ serviceLine: '  ' })).toBeNull()
    expect(givingFooter(null)).toBeNull()
  })
})
