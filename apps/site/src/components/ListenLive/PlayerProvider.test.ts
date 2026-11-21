import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LiveChannel } from '@/lib/live/channels'
import type { Track } from '@/lib/player/track'

import { PlayAudioButton } from './PlayAudioButton'
import { PlayerProvider, useLivePlayer, usePlayer } from './PlayerProvider'

// The site's one player. These pin what the owner asked for: every play button hands its audio to the same element, the audio stays
// active (the provider is in the layout, so it is never remounted by navigation), and live and on-demand audio never play together.

const fm: LiveChannel = { key: 'fm', name: 'WUWF 88.1', short: '88.1', streamUrl: 'https://stream.example.org/fm.mp3', cadenceChannelId: null, description: null }
const hd2: LiveChannel = { key: 'hd2', name: 'WUWF HD2', short: 'HD2', streamUrl: 'https://stream.example.org/hd2.mp3', cadenceChannelId: null, description: null }
const story = (id: string): Track => ({ id, src: `https://audio.example.org/${id}.mp3`, title: `Story ${id}`, credit: 'WUWF News', durationSeconds: 120, href: `/s/${id}` })

const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()
const load = vi.fn()

beforeEach(() => {
  // jsdom has no media playback: the element's methods are stubs we can watch.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load })
  play.mockClear()
  pause.mockClear()
  load.mockClear()
})
afterEach(cleanup)

/** The provider around some children (its `children` prop is required, so they go in the props). */
const provide = (channels: LiveChannel[], ...children: React.ReactNode[]) =>
  React.createElement(PlayerProvider, { channels, children: React.createElement(React.Fragment, null, ...children) })

const wrapper = (channels: LiveChannel[]) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => provide(channels, children)
  return Wrapper
}
const element = () => document.querySelector('audio') as HTMLAudioElement
/** What the browser reports once the audio actually starts. */
const sound = () => act(() => void fireEvent.playing(element()))

function setup(channels: LiveChannel[] = [fm, hd2]) {
  return renderHook(() => ({ player: usePlayer()!, live: useLivePlayer() }), { wrapper: wrapper(channels) })
}

describe('the one player', () => {
  it('has a single audio element, however many play buttons there are', () => {
    render(provide([fm], React.createElement(PlayAudioButton, { track: story('a') }), React.createElement(PlayAudioButton, { track: story('b') })))
    expect(document.querySelectorAll('audio')).toHaveLength(1)
    expect(element().getAttribute('src')).toBeNull() // nothing is requested before play
  })

  it('plays a track in the shared element and shows it as the active audio', () => {
    const { result } = setup()
    act(() => result.current.player.toggleTrack(story('a')))
    expect(element().getAttribute('src')).toBe('https://audio.example.org/a.mp3')
    expect(play).toHaveBeenCalledTimes(1)
    sound()
    expect(result.current.player).toMatchObject({ mode: 'track', status: 'playing', started: true })
    expect(result.current.player.track?.id).toBe('a')
  })

  it('replaces the audio when another track is started, in the same element', () => {
    const { result } = setup()
    act(() => result.current.player.toggleTrack(story('a')))
    act(() => result.current.player.toggleTrack(story('b')))
    expect(document.querySelectorAll('audio')).toHaveLength(1)
    expect(element().getAttribute('src')).toBe('https://audio.example.org/b.mp3')
    expect(result.current.player.track?.id).toBe('b')
  })

  it('pauses and resumes the same track without reloading it', () => {
    const { result } = setup()
    act(() => result.current.player.toggleTrack(story('a')))
    sound()
    act(() => result.current.player.toggleTrack(story('a')))
    expect(pause).toHaveBeenCalled()
    expect(result.current.player.status).toBe('paused')
    expect(element().getAttribute('src')).toBe('https://audio.example.org/a.mp3') // kept: resuming continues from here
    expect(load).not.toHaveBeenCalled()
    act(() => result.current.player.toggleTrack(story('a')))
    expect(play).toHaveBeenCalledTimes(2)
    expect(element().getAttribute('src')).toBe('https://audio.example.org/a.mp3')
  })

  it('switches from a track to the live stream, which then reads as live', () => {
    const { result } = setup()
    act(() => result.current.player.toggleTrack(story('a')))
    sound()
    expect(result.current.live).toMatchObject({ status: 'idle', started: false }) // the Listen live button is not "playing"
    act(() => result.current.live!.toggle())
    expect(element().getAttribute('src')).toBe(fm.streamUrl)
    sound()
    expect(result.current.player).toMatchObject({ mode: 'live', status: 'playing', track: null })
    expect(result.current.live).toMatchObject({ status: 'playing', started: true })
  })

  it('does not cut a track off when a channel is only selected', () => {
    const { result } = setup()
    act(() => result.current.player.toggleTrack(story('a')))
    sound()
    act(() => result.current.live!.select('hd2'))
    expect(element().getAttribute('src')).toBe('https://audio.example.org/a.mp3')
    expect(result.current.player).toMatchObject({ mode: 'track', status: 'playing' })
    expect(result.current.live!.current.key).toBe('hd2') // "Listen live" will now start HD2
  })

  it('works with no live channels set: tracks play, and the live controls stay hidden', () => {
    const { result } = setup([])
    expect(result.current.live).toBeNull()
    act(() => result.current.player.toggleTrack(story('a')))
    expect(element().getAttribute('src')).toBe('https://audio.example.org/a.mp3')
  })

  it('seeks inside the track and skips', () => {
    const { result } = setup()
    act(() => result.current.player.toggleTrack(story('a')))
    Object.defineProperty(element(), 'duration', { configurable: true, value: 120 })
    act(() => result.current.player.seek(500))
    expect(element().currentTime).toBe(120)
    act(() => result.current.player.skip(-15))
    expect(element().currentTime).toBe(105)
  })

  it('closes: stops, drops the audio and hides the bar', () => {
    const { result } = setup()
    act(() => result.current.player.toggleTrack(story('a')))
    act(() => result.current.player.close())
    expect(element().getAttribute('src')).toBeNull()
    expect(result.current.player).toMatchObject({ started: false, status: 'idle', track: null })
  })

  it('reports a failed start', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('no', 'NotAllowedError')))
    const { result } = setup()
    await act(async () => result.current.player.toggleTrack(story('a')))
    expect(result.current.player.status).toBe('error')
  })
})

describe('the play button', () => {
  const view = (track: Track) =>
    render(provide([fm], React.createElement(PlayAudioButton, { track }), React.createElement(PlayAudioButton, { track: story('other') })))

  it('names the story and its length, and starts it in the player when pressed', () => {
    view(story('a'))
    const button = screen.getByRole('button', { name: 'Listen: Story a' })
    expect(button.textContent).toContain('2:00')
    fireEvent.click(button)
    expect(element().getAttribute('src')).toBe('https://audio.example.org/a.mp3')
  })

  it('shows Pause on the one that is playing and not on the others, and Resume once paused', () => {
    view(story('a'))
    fireEvent.click(screen.getByRole('button', { name: 'Listen: Story a' }))
    sound()
    expect(screen.getByRole('button', { name: 'Pause: Story a' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Listen: Story other' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pause: Story a' }))
    expect(screen.getByRole('button', { name: 'Listen: Story a' }).textContent).toContain('Resume')
  })

  it('stands in a plain audio control when there is no provider', () => {
    render(React.createElement(PlayAudioButton, { track: story('a') }))
    expect(document.querySelector('audio')?.getAttribute('src')).toBe('https://audio.example.org/a.mp3')
  })
})
