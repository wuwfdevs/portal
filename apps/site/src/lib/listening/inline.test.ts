import { describe, expect, it } from 'vitest'

import { beginLabel, inlineEyebrow, placedEyebrow, recipientLine } from './inline'

describe('eyebrows', () => {
  it('builds the eyebrow from the context, then the desk', () => {
    expect(inlineEyebrow({ contextLabel: 'Coastal Futures', fromLabel: 'from the news desk' })).toBe('WUWF Listens · Coastal Futures')
    expect(inlineEyebrow({ contextLabel: null, fromLabel: 'from the news desk' })).toBe('WUWF Listens · from the news desk')
    expect(inlineEyebrow({ contextLabel: null, fromLabel: null })).toBe('WUWF Listens')
  })

  it('adds who asked only when the Portal says', () => {
    expect(placedEyebrow({ contextLabel: 'Coastal Futures', fromLabel: null, askedBy: 'Leigh Ostrander' })).toBe('WUWF Listens · Coastal Futures · asked by Leigh Ostrander')
    expect(placedEyebrow({ contextLabel: null, fromLabel: null, askedBy: '  ' })).toBe('WUWF Listens')
    expect(placedEyebrow({ contextLabel: null, fromLabel: null, askedBy: null })).toBe('WUWF Listens')
  })
})

describe('placement copy', () => {
  it('leads with recording only after an episode', () => {
    expect(beginLabel('voice')).toBe('Record your answer')
    expect(beginLabel('story')).toBe('Begin')
    expect(beginLabel('topic')).toBe('Begin')
    expect(beginLabel('page')).toBe('Begin')
  })

  it('names who receives a message, or WUWF', () => {
    expect(recipientLine('Mary')).toBe('Sent to Mary.')
    expect(recipientLine('  the Unearthing Florida team ')).toBe('Sent to the Unearthing Florida team.')
    expect(recipientLine('  ')).toBe('Sent to WUWF.')
    expect(recipientLine(undefined)).toBe('Sent to WUWF.')
  })
})
