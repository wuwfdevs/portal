import { describe, expect, it } from 'vitest'

import { objectPositionOf } from './focal'

describe('objectPositionOf', () => {
  it('turns a focal point into an object-position', () => {
    expect(objectPositionOf({ focalX: 30, focalY: 80 })).toBe('30% 80%')
    expect(objectPositionOf({ focalX: 12.5, focalY: 50 })).toBe('12.5% 50%')
  })

  it('treats 0 as a real position, not as empty', () => {
    expect(objectPositionOf({ focalX: 0, focalY: 0 })).toBe('0% 0%')
    expect(objectPositionOf({ focalX: 100, focalY: 0 })).toBe('100% 0%')
  })

  it('brings a value outside 0 to 100 back into range', () => {
    expect(objectPositionOf({ focalX: -10, focalY: 140 })).toBe('0% 100%')
  })

  it('gives nothing, so the crop stays centred, when there is no usable focal point', () => {
    expect(objectPositionOf(null)).toBeUndefined()
    expect(objectPositionOf(undefined)).toBeUndefined()
    expect(objectPositionOf(42)).toBeUndefined()
    expect(objectPositionOf('a-media-id')).toBeUndefined()
    expect(objectPositionOf({})).toBeUndefined()
    expect(objectPositionOf({ focalX: null, focalY: null })).toBeUndefined()
    expect(objectPositionOf({ focalX: 40 })).toBeUndefined()
    expect(objectPositionOf({ focalX: '40', focalY: '60' })).toBeUndefined()
    expect(objectPositionOf({ focalX: Number.NaN, focalY: 50 })).toBeUndefined()
    expect(objectPositionOf({ focalX: Number.POSITIVE_INFINITY, focalY: 50 })).toBeUndefined()
  })
})
