import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ListeningQuery } from '@wuwf/portal-contracts'

import { QuestionSet } from './QuestionSet'

// Review screen: a recording saved on this visit can be heard again from the page's memory; it is dropped when the answer is replaced.

vi.mock('@/app/(frontend)/listens/actions', () => ({
  startResponse: vi.fn(async () => ({ ok: true, submissionId: 's1', answers: [] })),
  reserveAnswer: vi.fn(),
  completeAnswer: vi.fn(),
  saveTextAnswer: vi.fn(),
  saveDetails: vi.fn(),
  finalizeResponse: vi.fn(),
}))
vi.mock('@/lib/listening/send-answer', () => ({ saveAudioAnswer: vi.fn(async () => ({ ok: true })) }))
// A recorder with the microphone ready, which "records" a 3 second take when started and forgets it when discarded.
vi.mock('./useRecorder', async () => {
  const react = await import('react')
  return {
    useRecorder: () => {
      const [take, setTake] = react.useState<{ blob: Blob; seconds: number; durationMs: number } | null>(null)
      return {
        phase: take ? 'recorded' : 'idle',
        elapsed: 0,
        take,
        mic: 'ready',
        guidance: null,
        acquire: async () => true,
        start: async () => setTake({ blob: new Blob(['x'], { type: 'audio/webm' }), seconds: 3, durationMs: 3000 }),
        stop: () => {},
        discard: () => setTake(null),
      }
    },
  }
})

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:take')
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

const query = {
  publicId: 'abcd1234efgh5678',
  title: 'A place with a history people forget?',
  intro: null,
  contextLabel: null,
  fromLabel: null,
  askedBy: null,
  state: 'open',
  allowTextAnswers: false,
  askContactPermission: false,
  consentText: 'Terms.',
  fields: { name: 'hidden', email: 'hidden', phone: 'hidden', city: 'hidden', note: 'hidden' },
  questions: [{ id: 'q1', position: 1, prompt: 'First?', guidance: null, required: true, maxDurationSeconds: 120 }],
} as unknown as ListeningQuery

const toReview = async () => {
  render(React.createElement(QuestionSet, { query, placement: 'story' }))
  fireEvent.click(screen.getByRole('button', { name: 'Begin' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to question 1' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Start recording' }))
  // The take is shown with its own player before it is saved.
  fireEvent.click(await screen.findByRole('button', { name: 'Save and review' }))
  await screen.findByText('You can replace any recording before you continue.')
}

describe('review playback', () => {
  it('shows a player on a recording saved this visit, and no apology', async () => {
    await toReview()
    expect(screen.getByRole('group', { name: 'Listen back' })).toBeTruthy()
    expect(screen.getByText('Answered · 0:03')).toBeTruthy()
    expect(screen.queryByText(/Playback isn’t available/)).toBeNull()
  })

  it('drops the player when the answer is replaced, and shows the recorder again', async () => {
    await toReview()
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(await screen.findByRole('button', { name: 'Start recording' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Listen back' })).toBeNull()
  })
})
