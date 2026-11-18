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
