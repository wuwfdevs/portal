import { describe, expect, it } from 'vitest'

import { checkKitchen, kitchenTablePath } from './kitchen'

describe('checkKitchen', () => {
  it('takes a name and a place, both optional, trimmed', () => {
    expect(checkKitchen({ hostName: ' Rosa ', place: ' my kitchen ' })).toEqual({ ok: true, value: { hostName: 'Rosa', place: 'my kitchen' } })
    expect(checkKitchen({ hostName: '', place: '  ' })).toEqual({ ok: true, value: { hostName: null, place: null } })
  })
  it('refuses what the Portal would refuse', () => {
    expect(checkKitchen({ hostName: 'x'.repeat(61), place: '' }).ok).toBe(false)
    expect(checkKitchen({ hostName: '', place: 'x'.repeat(81) }).ok).toBe(false)
  })
})

describe('kitchenTablePath', () => {
  it('is the table link page', () => {
    expect(kitchenTablePath('abc_DEF-123')).toBe('/listens/table/abc_DEF-123?host=kitchen')
  })
})
