import type { ListeningQuestion } from '@wuwf/portal-contracts'
import { describe, expect, it } from 'vitest'

import { inlineEyebrow, inlineQuestion, otherQuestionCount, recipientName } from './inline'

const FIELDS = { name: 'optional', email: 'optional', phone: 'hidden', city: 'optional', note: 'hidden' } as const
const q = (position: number, required: boolean): ListeningQuestion => ({ id: `q${position}`, position, prompt: `P${position}`, guidance: null, required, maxDurationSeconds: 120 })

describe('inlineQuestion', () => {
  it('is the first question when the query is open', () => {
    expect(inlineQuestion({ state: 'open', fields: FIELDS, questions: [q(2, false), q(1, true)] })?.id).toBe('q1')
  })

  it('is null when another question is required, because one answer could not finish the response', () => {
    expect(inlineQuestion({ state: 'open', fields: FIELDS, questions: [q(1, false), q(2, true)] })).toBeNull()
  })

  it('is null for a query that is not open, or has no questions', () => {
    expect(inlineQuestion({ state: 'closed', fields: FIELDS, questions: [q(1, false)] })).toBeNull()
    expect(inlineQuestion({ state: 'not_yet_open', fields: FIELDS, questions: [q(1, false)] })).toBeNull()
    expect(inlineQuestion({ state: 'open', fields: FIELDS, questions: [] })).toBeNull()
  })

  it('is null when the query requires a detail the inline form has no box for', () => {
    expect(inlineQuestion({ state: 'open', fields: { ...FIELDS, city: 'required' }, questions: [q(1, false)] })).toBeNull()
    expect(inlineQuestion({ state: 'open', fields: { ...FIELDS, name: 'required', email: 'required' }, questions: [q(1, false)] })?.id).toBe('q1')
  })
})

describe('labels', () => {
  it('names the first name, or WUWF', () => {
    expect(recipientName({ askedBy: 'Leigh Ostrander' })).toBe('Leigh')
    expect(recipientName({ askedBy: '  ' })).toBe('WUWF')
    expect(recipientName({ askedBy: null })).toBe('WUWF')
  })

  it('builds the eyebrow from the context, then the desk', () => {
    expect(inlineEyebrow({ contextLabel: 'Coastal Futures', fromLabel: 'from the news desk' })).toBe('WUWF Listens · Coastal Futures')
    expect(inlineEyebrow({ contextLabel: null, fromLabel: 'from the news desk' })).toBe('WUWF Listens · from the news desk')
    expect(inlineEyebrow({ contextLabel: null, fromLabel: null })).toBe('WUWF Listens')
  })

  it('counts the other questions', () => {
    expect(otherQuestionCount({ questions: [q(1, false), q(2, false)] })).toBe(1)
    expect(otherQuestionCount({ questions: [q(1, false)] })).toBe(0)
  })
})
