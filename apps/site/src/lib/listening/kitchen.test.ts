import { describe, expect, it } from 'vitest'

import { checkKitchen, kitchenTablePath } from './kitchen'

describe('checkKitchen', () => {
  it('takes a name and a place, both optional, trimmed', () => {
    expect(checkKitchen({ hostName: ' Rosa ', place: ' my kitchen ', minutes: 45 })).toEqual({ ok: true, value: { hostName: 'Rosa', place: 'my kitchen', minutes: 45 } })
    expect(checkKitchen({ hostName: '', place: '  ', minutes: 30 })).toEqual({ ok: true, value: { hostName: null, place: null, minutes: 30 } })
  })
  it('refuses what the Portal would refuse', () => {
    expect(checkKitchen({ hostName: 'x'.repeat(61), place: '', minutes: 30 }).ok).toBe(false)
    expect(checkKitchen({ hostName: '', place: 'x'.repeat(81), minutes: 30 }).ok).toBe(false)
    // How long it runs is one of the lengths offered, and is never assumed.
    expect(checkKitchen({ hostName: '', place: '', minutes: 25 }).ok).toBe(false)
    expect(checkKitchen({ hostName: '', place: '', minutes: Number.NaN }).ok).toBe(false)
  })
})

describe('kitchenTablePath', () => {
  it('is the table link page', () => {
    expect(kitchenTablePath('abc_DEF-123')).toBe('/listens/table/abc_DEF-123?host=kitchen')
  })
})
