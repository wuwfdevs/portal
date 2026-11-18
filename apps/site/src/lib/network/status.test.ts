import { describe, expect, it } from 'vitest'

import { NETWORK_STATUSES, statusChangeAllowed } from './status'

describe('statusChangeAllowed', () => {
  it('lets an editor keep, release and dismiss a waiting story', () => {
    expect(statusChangeAllowed('new', 'held', false)).toBe(true)
    expect(statusChangeAllowed('held', 'new', false)).toBe(true)
    expect(statusChangeAllowed('new', 'dismissed', false)).toBe(true)
    expect(statusChangeAllowed('held', 'dismissed', false)).toBe(true)
    expect(statusChangeAllowed('gone', 'dismissed', false)).toBe(true)
  })

  it('never lets an editor mark a story published or gone by hand, whatever it was', () => {
    for (const from of NETWORK_STATUSES) {
      if (from === 'published') continue
      expect(statusChangeAllowed(from, 'published', false), `${from} -> published`).toBe(false)
    }
    for (const from of NETWORK_STATUSES) {
      if (from === 'gone') continue
      expect(statusChangeAllowed(from, 'gone', false), `${from} -> gone`).toBe(false)
    }
  })

  it('does not let an editor bring a dismissed story back or change a published one', () => {
    expect(statusChangeAllowed('dismissed', 'new', false)).toBe(false)
    expect(statusChangeAllowed('published', 'new', false)).toBe(false)
    expect(statusChangeAllowed('published', 'dismissed', false)).toBe(false)
  })

  it('lets the system do any of it', () => {
    for (const from of NETWORK_STATUSES) for (const to of NETWORK_STATUSES) expect(statusChangeAllowed(from, to, true)).toBe(true)
  })

  it('treats saving the same status as no change', () => {
    for (const s of NETWORK_STATUSES) expect(statusChangeAllowed(s, s, false)).toBe(true)
  })
})
