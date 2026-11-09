import type { ListeningQuestion } from '@wuwf/portal-contracts'
import { describe, expect, it } from 'vitest'

import {
  EMPTY_CONSENT,
  EMPTY_DETAILS,
  answersFromProgress,
  availabilityMessage,
  consentToWire,
  contactWithoutWay,
  detailsToWire,
  doneText,
  introSummary,
  maxMinutes,
  pageMeta,
  missingDetails,
  progressPercent,
  questionFooter,
  reviewBlockedText,
  reviewRows,
  stepTitle,
  type LocalAnswer,
} from './flow'

const q = (id: string, position: number, required: boolean): ListeningQuestion => ({ id, position, prompt: `Prompt ${position}`, guidance: null, required, maxDurationSeconds: 120 })
const QUESTIONS = [q('a', 1, true), q('b', 2, false), q('c', 3, false)]
const saved = (seconds: number | null = 42): LocalAnswer => ({ state: 'saved', seconds, text: null, retake: false })

describe('answersFromProgress', () => {
  it('shows only uploaded answers to known questions as saved', () => {
    const out = answersFromProgress(QUESTIONS, [
      { answerId: '1', questionId: 'a', kind: 'audio', status: 'uploaded', durationMs: 42_400, text: null },
      { answerId: '2', questionId: 'b', kind: 'audio', status: 'pending', durationMs: null, text: null },
      { answerId: '3', questionId: 'zzz', kind: 'audio', status: 'uploaded', durationMs: 1000, text: null },
      { answerId: '4', questionId: 'c', kind: 'text', status: 'uploaded', durationMs: null, text: 'Hello' },
    ])
    expect(Object.keys(out).sort()).toEqual(['a', 'c'])
    expect(out['a']).toEqual({ state: 'saved', seconds: 42, text: null, retake: false })
    expect(out['c']).toEqual({ state: 'saved', seconds: null, text: 'Hello', retake: false })
  })
})

describe('review', () => {
  it('describes each row and offers Replace only for what is saved', () => {
    const rows = reviewRows(QUESTIONS, { a: saved(42), b: { state: 'skipped', seconds: null, text: null, retake: false } })
    expect(rows.map((r) => [r.status, r.action])).toEqual([
      ['Answered · 0:42', 'Replace'],
      ['Skipped', 'Record'],
      ['Not answered', 'Record'],
    ])
    expect(reviewRows(QUESTIONS, {})[0]?.status).toBe('Required — still needs an answer')
  })

  it('names what blocks continuing, and nothing when it is clear', () => {
    expect(reviewBlockedText(QUESTIONS, {})).toBe('Record at least one answer before submitting.')
    expect(reviewBlockedText(QUESTIONS, { b: saved() })).toBe('Question 1 is required and still needs an answer.')
    expect(reviewBlockedText(QUESTIONS, { a: saved() })).toBeNull()
  })
})

describe('copy', () => {
  it('titles each screen, as on the board', () => {
    expect(stepTitle('question', { title: 'T' }, 1, 3)).toBe('Question 2 of 3')
    expect(stepTitle('intro', { title: 'Rebuilding' }, 0, 3)).toBe('Rebuilding')
    expect(stepTitle('done', { title: 'T' }, 0, 3)).toBe('WUWF received your response')
  })

  it('fills the progress bar only while answering', () => {
    expect(progressPercent('intro', 0, 3)).toBe(0)
    expect(progressPercent('question', 0, 3)).toBe(33)
    expect(progressPercent('question', 2, 3)).toBe(100)
    expect(progressPercent('consent', 0, 3)).toBe(100)
  })

  it('summarises the set, the footer and the ending', () => {
    expect(introSummary({ questions: QUESTIONS, allowTextAnswers: false })).toBe('3 questions · one audio answer each')
    expect(introSummary({ questions: [q('a', 1, false)], allowTextAnswers: true })).toBe('1 question · by voice or in writing')
    expect(questionFooter(1, 3, 0)).toBe('Question 2 of 3')
    expect(questionFooter(1, 3, 1)).toBe('Question 2 of 3 · 1 answer saved')
    expect(doneText(2)).toBe('2 answers received. Thank you — you can close this page.')
  })

  it('says why a closed or unopened question cannot be started', () => {
    expect(availabilityMessage('open', null)).toBeNull()
    expect(availabilityMessage('closed', null)).toMatch(/closed/)
    expect(availabilityMessage('not_yet_open', '2026-12-01T15:00:00Z')).toBe('This question opens December 1.')
    expect(availabilityMessage('not_yet_open', null)).toMatch(/not opened/)
  })
})

describe('time', () => {
  it('adds the limits up to whole minutes, never under one', () => {
    expect(maxMinutes([{ maxDurationSeconds: 120 }, { maxDurationSeconds: 60 }, { maxDurationSeconds: 60 }])).toBe(4)
    expect(maxMinutes([{ maxDurationSeconds: 15 }])).toBe(1)
    expect(maxMinutes([{ maxDurationSeconds: 61 }])).toBe(2)
  })

  it('writes the line under the eyebrow', () => {
    expect(pageMeta({ questions: QUESTIONS, allowTextAnswers: false })).toBe('3 questions · up to 6 minutes · by voice')
    expect(pageMeta({ questions: [q('a', 1, false)], allowTextAnswers: true })).toBe('1 question · up to 2 minutes · by voice or in writing')
  })
})

describe('details and consent', () => {
  const FIELDS = { name: 'optional', email: 'optional', phone: 'hidden', city: 'optional', note: 'hidden' } as const

  it('sends a blank detail as null and trims the rest', () => {
    expect(detailsToWire({ ...EMPTY_DETAILS, name: '  Ada ', email: '' })).toEqual({ name: 'Ada', email: null, phone: null, city: null, note: null })
  })

  it('warns, without blocking, when contact is allowed and there is no way to reach the person', () => {
    expect(contactWithoutWay(EMPTY_DETAILS, { ...EMPTY_CONSENT, contact: true }, { fields: FIELDS })).toBe(true)
    expect(contactWithoutWay({ ...EMPTY_DETAILS, email: 'a@b.org' }, { ...EMPTY_CONSENT, contact: true }, { fields: FIELDS })).toBe(false)
    expect(contactWithoutWay(EMPTY_DETAILS, EMPTY_CONSENT, { fields: FIELDS })).toBe(false)
    // A phone number the query never asks for cannot be a way to reach someone.
    expect(contactWithoutWay({ ...EMPTY_DETAILS, phone: '850' }, { ...EMPTY_CONSENT, contact: true }, { fields: FIELDS })).toBe(true)
  })

  it('lists required details still empty', () => {
    expect(missingDetails({ fields: { ...FIELDS, name: 'required', city: 'required' } }, { ...EMPTY_DETAILS, name: 'Ada' })).toEqual(['city'])
  })

  it('never records a permission the query did not ask about', () => {
    const consent = { contact: true, identify: true, requestAnonymous: true, agreed: true }
    expect(consentToWire({ askContactPermission: true, askAttributionPermission: false, allowAnonymousRequest: false }, consent)).toEqual({
      contact: true,
      identify: false,
      requestAnonymous: false,
    })
  })
})
