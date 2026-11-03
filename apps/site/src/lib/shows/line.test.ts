import { describe, expect, it } from 'vitest'

import { showLine } from './line'

describe('showLine', () => {
  it('says who hosts it, when it comes out and how many episodes', () => {
    expect(showLine({ hosts: ['Leigh Ostrander'], schedule: 'New episodes every other Friday', episodes: 3 })).toBe('Hosted by Leigh Ostrander · New episodes every other Friday · 3 episodes')
  })
  it('uses the singular, joins several hosts, and leaves out what is missing', () => {
    expect(showLine({ hosts: ['A', 'B'], episodes: 1 })).toBe('Hosted by A, B · 1 episode')
    expect(showLine({ hosts: [], schedule: '  ', episodes: 0 })).toBeNull()
    expect(showLine({ hosts: [], schedule: 'Sundays at 7 p.m.', episodes: 0 })).toBe('Sundays at 7 p.m.')
  })
})
