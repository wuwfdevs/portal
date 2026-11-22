import { describe, expect, it } from 'vitest'

import { addQuestion, blankDraft, draftFromQuery, draftProblem, fromLocalInput, moveQuestion, removeQuestion, saveBody, statusActions, toLocalInput } from './form'

const filled = () => ({ ...blankDraft(), internalTitle: 'Storm', publicTitle: 'How is recovery?', questions: [{ prompt: 'What changed?', guidance: '', required: false, seconds: '120' }] })

describe('the listening question form', () => {
  it('starts with one empty question and asks for the plain things first', () => {
    expect(blankDraft().questions).toHaveLength(1)
    expect(draftProblem(blankDraft())).toMatch(/internal title/)
    expect(draftProblem({ ...blankDraft(), internalTitle: 'a' })).toMatch(/public title/)
    expect(draftProblem({ ...filled(), questions: [{ ...filled().questions[0]!, prompt: ' ' }] })).toBe('Question 1 needs its words.')
    expect(draftProblem(filled())).toBeNull()
  })

  it('names a bad recording length, and a closing time before the opening time', () => {
    const bad = { ...filled(), questions: [{ ...filled().questions[0]!, seconds: '5' }] }
    expect(draftProblem(bad)).toMatch(/Question 1: the longest recording/)
    expect(draftProblem({ ...filled(), opensAt: '2026-12-02T09:00', closesAt: '2026-12-01T09:00' })).toMatch(/after the opening/)
  })

  it('holds at most five questions and moves them without losing ids', () => {
    let d = filled()
    for (let i = 0; i < 8; i++) d = addQuestion(d)
    expect(d.questions).toHaveLength(5)
    const two = { ...filled(), questions: [{ ...filled().questions[0]!, id: 'a' }, { ...filled().questions[0]!, id: 'b' }] }
    expect(moveQuestion(two, 0, 1).questions.map((q) => q.id)).toEqual(['b', 'a'])
    expect(moveQuestion(two, 0, -1)).toBe(two)
    expect(removeQuestion(two, 0).questions.map((q) => q.id)).toEqual(['b'])
  })

  it('sends text trimmed, blanks as null, numbers as numbers, and an id only for a held question', () => {
    const body = saveBody({ ...filled(), askedBy: '  ', publicIntro: ' Tell us. ', questions: [{ id: 'q1', prompt: ' One ', guidance: '', required: true, seconds: '90' }, { prompt: 'Two', guidance: ' g ', required: false, seconds: '120' }] }, 'abcd1234efgh5678') as {
      publicId: string
      query: Record<string, unknown>
      questions: Array<Record<string, unknown>>
    }
    expect(body.publicId).toBe('abcd1234efgh5678')
    expect(body.query).toMatchObject({ askedBy: null, publicIntro: 'Tell us.', opensAt: null })
    expect(body.questions[0]).toEqual({ id: 'q1', prompt: 'One', guidance: null, required: true, maxDurationSeconds: 90 })
    expect(body.questions[1]).toEqual({ prompt: 'Two', guidance: 'g', required: false, maxDurationSeconds: 120 })
    expect('publicId' in (saveBody(filled(), null) as object)).toBe(false)
  })

  it('round-trips a time through the browser\'s own zone', () => {
    const iso = '2026-12-01T14:30:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('not a date')).toBeNull()
  })

  it('reads a held query into a draft', () => {
    const d = draftFromQuery({ publicId: 'abcd1234efgh5678', status: 'draft', internalTitle: 'a', publicTitle: 'b', publicIntro: '', internalNotes: null, askedBy: null, fromLabel: 'WUWF', contextLabel: null, allowTextAnswers: false, opensAt: null, closesAt: null, submissionCount: 0, updatedAt: '', questions: [{ id: 'q', position: 1, prompt: 'p', guidance: null, required: true, maxDurationSeconds: 60 }] })
    expect(d).toMatchObject({ fromLabel: 'WUWF', askedBy: '', allowTextAnswers: false })
    expect(d.questions[0]).toEqual({ id: 'q', prompt: 'p', guidance: '', required: true, seconds: '60' })
  })

  it('offers only the status changes that make sense', () => {
    expect(statusActions('draft').map((a) => a.to)).toEqual(['open'])
    expect(statusActions('open').map((a) => a.to)).toEqual(['closed'])
    expect(statusActions('closed').map((a) => a.to)).toEqual(['open', 'archived'])
  })
})
