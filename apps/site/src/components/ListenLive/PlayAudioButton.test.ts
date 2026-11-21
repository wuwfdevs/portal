import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LiveChannel } from '@/lib/live/channels'
import type { Track } from '@/lib/player/track'

import { PlayAudioButton } from './PlayAudioButton'
import { PlayerProvider } from './PlayerProvider'

// The play button's look (direction C2): lime with dark text while idle, ink while its audio plays. One file serves every place that plays station audio.

const fm: LiveChannel = { key: 'fm', name: 'WUWF 88.1', short: '88.1', streamUrl: 'https://stream.example.org/fm.mp3', cadenceChannelId: null, description: null }
const track: Track = { id: 'a', src: 'https://audio.example.org/a.mp3', title: 'Story a', credit: 'WUWF News', durationSeconds: 120, href: '/s/a' }

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() })
})
afterEach(cleanup)

const draw = (props: Partial<React.ComponentProps<typeof PlayAudioButton>> = {}) =>
  render(React.createElement(PlayerProvider, { channels: [fm], children: React.createElement(PlayAudioButton, { track, ...props }) }))

describe('PlayAudioButton', () => {
  it('is lime with dark text while idle, a pill, and not the old blue', () => {
    draw()
    const button = screen.getByRole('button', { name: 'Listen: Story a' })
    expect(button.className).toContain('bg-wuwf-lime')
    expect(button.className).toContain('text-surface-dark')
    expect(button.className).toContain('rounded-pill')
    expect(button.className).not.toContain('bg-wuwf-blue-700')
  })

  it('turns ink while its audio plays, and says Pause', () => {
    draw()
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Listen: Story a' })))
    const button = screen.getByRole('button', { name: 'Pause: Story a' })
    expect(button.className).toContain('bg-ink')
    expect(button.className).not.toContain('bg-wuwf-lime')
  })

  it('takes the band\'s own button colours inside a section band, so it is right on every tone', () => {
    draw({ toned: true })
    const button = screen.getByRole('button', { name: 'Listen: Story a' })
    expect(button.className).toContain('--tone-button')
    expect(button.className).not.toContain('bg-wuwf-lime')
  })

  it('lets the caller add layout', () => {
    draw({ className: 'self-start' })
    expect(screen.getByRole('button', { name: 'Listen: Story a' }).className).toContain('self-start')
  })
})
