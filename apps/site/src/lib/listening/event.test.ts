import { describe, expect, it } from 'vitest'

import { checkSeat, eventIsFull, formatEventPlace, formatEventWhen, seatsSentence } from './event'

describe('formatEventWhen', () => {
  it("is in the station's time, not UTC", () => {
    // 16:00Z on Nov. 15 is 10:00 a.m. Central.
    expect(formatEventWhen('2026-11-15T16:00:00Z', '2026-11-15T18:00:00Z')).toBe('Sunday, Nov. 15, 10:00 a.m. to 12:00 p.m.')
  })
  it('names both days when it crosses midnight', () => {
    const text = formatEventWhen('2026-11-15T23:00:00Z', '2026-11-16T07:00:00Z')
    expect(text).toMatch(/Sunday, Nov\. 15, 5:00 p\.m\. to Monday, Nov\. 16, 1:00 a\.m\./)
  })
  it('is empty for a time it cannot read', () => {
    expect(formatEventWhen('soon', 'later')).toBe('')
  })
})

describe('formatEventPlace', () => {
  it('joins what is there and leaves out what is not', () => {
    expect(formatEventPlace({ placeName: 'Milton Community Center', address: '5629 Byrom St', city: 'Milton' })).toBe('Milton Community Center, 5629 Byrom St, Milton')
    expect(formatEventPlace({ placeName: 'A house', address: null, city: ' ' })).toBe('A house')
  })
})

describe('seats', () => {
  it('says nothing when there is no limit', () => {
    expect(seatsSentence(null)).toBeNull()
    expect(eventIsFull({ seatsLeft: null })).toBe(false)
  })
  it('says how many are left, and when none are', () => {
    expect(seatsSentence(12)).toBe('12 seats left.')
    expect(seatsSentence(1)).toBe('1 seat left.')
    expect(seatsSentence(0)).toBe('Every seat is taken.')
    expect(eventIsFull({ seatsLeft: 0 })).toBe(true)
  })
})

describe('checkSeat', () => {
  it('needs a name and an email that looks like one', () => {
    expect(checkSeat({ name: ' Dana ', email: ' dana@example.com ' })).toEqual({ ok: true, value: { name: 'Dana', email: 'dana@example.com' } })
    expect(checkSeat({ name: '', email: 'dana@example.com' }).ok).toBe(false)
    expect(checkSeat({ name: 'Dana', email: 'dana' }).ok).toBe(false)
    expect(checkSeat({ name: 'Dana', email: '' }).ok).toBe(false)
  })
})
