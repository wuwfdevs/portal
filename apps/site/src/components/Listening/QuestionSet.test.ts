import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ListeningQuery } from '@wuwf/portal-contracts'

import { QuestionSet } from './QuestionSet'

// The full question set is the one listening UI; where it is placed only changes its frame. These pin that: the same screens
// everywhere, one h1 per page (the host page's, not ours), nothing scrolled to on load, and the placement-specific copy.

vi.mock('@/app/(frontend)/listens/actions', () => ({
  startResponse: vi.fn(),
  reserveAnswer: vi.fn(),
  completeAnswer: vi.fn(),
  saveTextAnswer: vi.fn(),
  saveDetails: vi.fn(),
  finalizeResponse: vi.fn(),
}))

afterEach(cleanup)

const query = {
  publicId: 'abcd1234efgh5678',
  title: 'What is a place near you with a history people tend to forget?',
  intro: 'Tell us about it.',
  contextLabel: 'Coastal Futures',
  fromLabel: null,
  askedBy: 'Leigh Ostrander',
  state: 'open',
  allowTextAnswers: true,
  askContactPermission: true,
  consentText: 'Terms.',
  fields: { name: 'optional', email: 'optional', phone: 'hidden', city: 'hidden', note: 'hidden' },
  questions: [
    { id: 'q1', position: 1, prompt: 'First?', guidance: null, required: true, maxDurationSeconds: 120 },
    { id: 'q2', position: 2, prompt: 'Second?', guidance: null, required: true, maxDurationSeconds: 120 },
  ],
} as unknown as ListeningQuery

const show = (props: Partial<React.ComponentProps<typeof QuestionSet>> = {}) => render(React.createElement(QuestionSet, { query, ...props }))

describe('QuestionSet placements', () => {
  it('is the card alone, with the page heading, on its own page', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: query.title })).toBeTruthy()
    expect(screen.queryByText(/WUWF Listens/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Begin' })).toBeTruthy()
  })

  it.each(['story', 'voice'] as const)('%s: the same set under an h2 and an eyebrow, with no focus taken on load', (placement) => {
    show({ placement })
    expect(screen.getByRole('heading', { level: 2, name: query.title })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByText('WUWF Listens · Coastal Futures · asked by Leigh Ostrander')).toBeTruthy()
    expect(document.activeElement).toBe(document.body)
  })

  it('names who receives the answers, and a line about them, in the in-story ask only when the editor gave them', () => {
    show({ placement: 'story' })
    expect(screen.queryByText(/Sent to/)).toBeNull()
    cleanup()
    show({ placement: 'story', recipient: 'the Unearthing Florida team', description: 'We read every one.' })
    expect(screen.getByText(/Sent to the Unearthing Florida team\./)).toBeTruthy()
    expect(screen.getByText('We read every one.')).toBeTruthy()
  })

  it('always names a recipient after an episode or video, as WUWF when none is given', () => {
    show({ placement: 'voice' })
    expect(screen.getByText(/Sent to WUWF\./)).toBeTruthy()
  })

  it('shows the whole set even when every question is required', () => {
    show({ placement: 'story' })
    expect(screen.getByText('2 questions · by voice or in writing')).toBeTruthy()
  })

  it('voice leads with recording and names who receives it', () => {
    show({ placement: 'voice', recipient: 'Mary', description: 'Mary reads every message.' })
    expect(screen.getByRole('button', { name: 'Record your answer' })).toBeTruthy()
    expect(screen.getByText(/Sent to Mary\./)).toBeTruthy()
    expect(screen.getByText('Mary reads every message.')).toBeTruthy()
  })

  it('topic starts as an invitation and opens the same card in place, moving focus to it', () => {
    show({ placement: 'topic' })
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Begin' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Take part' }))
    const heading = screen.getByRole('heading', { level: 2, name: query.title })
    expect(screen.getByRole('button', { name: 'Begin' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Take part' })).toBeNull()
    expect(document.activeElement).toBe(heading)
  })
})

describe('QuestionSet review', () => {
  const actions = async () => (await import('@/app/(frontend)/listens/actions')) as unknown as { startResponse: ReturnType<typeof vi.fn> }

  // A resumed response: one recording and one written answer are already saved, so the review screen can be reached without a microphone.
  const toReview = async () => {
    const { startResponse } = await actions()
    startResponse.mockResolvedValue({
      ok: true,
      submissionId: 's1',
      answers: [
        { questionId: 'q1', status: 'uploaded', kind: 'audio', durationMs: 42_000, text: null },
        { questionId: 'q2', status: 'uploaded', kind: 'text', durationMs: null, text: 'In my own words.' },
      ],
    })
    show({ placement: 'story' })
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Allow microphone access' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Write my answers instead' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next question' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Review answers' }))
    await screen.findByText('You can replace any recording before you continue.')
  }

  it('says playback is not available for a recording saved before a reload, and offers none for a written answer', async () => {
    await toReview()
    expect(screen.getAllByText('Playback isn’t available once the page has been reloaded.')).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Listen back' })).toBeNull()
  })
})
