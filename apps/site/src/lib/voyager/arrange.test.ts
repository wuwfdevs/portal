import { describe, expect, it } from 'vitest'

import { staffRole } from './arrange'

describe('staffRole', () => {
  it('prefers the term\'s role, then the title, then nothing', () => {
    expect([staffRole('News editor', 'Reporter'), staffRole('  ', 'Reporter'), staffRole(null, null)]).toEqual(['News editor', 'Reporter', ''])
  })
})
