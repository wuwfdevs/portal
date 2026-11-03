import { describe, expect, it } from 'vitest'

import { wordsChanged } from './edit'

const body = (t: string) => ({ root: { children: [{ text: t }] } })

describe('wordsChanged', () => {
  const stored = { headline: 'Road closures', body: body('I-10 is closed.') }
  it('is false for a re-save that changes nothing, and for a save with no words in it', () => {
    expect(wordsChanged(stored, { headline: 'Road closures ', body: body('I-10 is closed.') })).toBe(false)
    expect(wordsChanged(stored, {})).toBe(false)
  })
  it('is true when the headline or the body changes', () => {
    expect(wordsChanged(stored, { headline: 'Road closures lifted' })).toBe(true)
    expect(wordsChanged(stored, { body: body('I-10 has reopened.') })).toBe(true)
  })
  it('is false for a new update (nothing stored yet to differ from)', () => {
    expect(wordsChanged(null, { headline: 'x', body: body('y') })).toBe(false)
  })
})
