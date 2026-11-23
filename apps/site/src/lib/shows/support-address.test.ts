import { describe, expect, it } from 'vitest'

import { showDonationHref } from './support-address'

describe('showDonationHref', () => {
  it('is the production\'s donation form address with its attribution code', () => {
    expect(showDonationHref({ showSupport: { donateUrl: ' https://give.example.org/form?fund=unearthing ' } })).toBe('https://give.example.org/form?fund=unearthing')
  })
  it('is nothing for an empty or unsafe address, or a production without one', () => {
    expect(showDonationHref({ showSupport: { donateUrl: '' } })).toBeNull()
    expect(showDonationHref({ showSupport: { donateUrl: 'javascript:alert(1)' } })).toBeNull()
    expect(showDonationHref({ showSupport: null })).toBeNull()
    expect(showDonationHref(null)).toBeNull()
  })
})
