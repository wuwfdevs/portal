import { describe, expect, it } from 'vitest'

import { clampSeek, isPlayableSrc, progressWords, trackFromAudio } from './track'

const audio = { id: 7, url: '/api/audio/file/story.mp3', title: 'Story audio', credit: ' WUWF News ', durationSeconds: 457 }

describe('trackFromAudio', () => {
  it('builds a track with a stable id and the story\'s title when given', () => {
    expect(trackFromAudio(audio, { title: ' The headline ', href: '/2026-11-16/the-headline' })).toEqual({
      id: 'audio-7',
      src: '/api/audio/file/story.mp3',
      title: 'The headline',
      credit: 'WUWF News',
      durationSeconds: 457,
      href: '/2026-11-16/the-headline',
    })
  })

  it('falls back to the file\'s own title and drops a missing or bad length', () => {
    expect(trackFromAudio({ ...audio, durationSeconds: 0 })?.title).toBe('Story audio')
    expect(trackFromAudio({ ...audio, durationSeconds: null })?.durationSeconds).toBeNull()
    expect(trackFromAudio({ ...audio, durationSeconds: Number.NaN })?.durationSeconds).toBeNull()
  })

  it('offers nothing to play without a usable address (a members-only file reads back without one)', () => {
    expect(trackFromAudio(null)).toBeNull()
    expect(trackFromAudio({ ...audio, url: null })).toBeNull()
    expect(trackFromAudio({ ...audio, url: 'javascript:alert(1)' })).toBeNull()
    expect(trackFromAudio({ ...audio, url: 'http://example.org/a.mp3' })).toBeNull()
  })

  it('links back only to a page of this site', () => {
    expect(trackFromAudio(audio, { href: 'https://evil.example/x' })?.href).toBeNull()
    expect(trackFromAudio(audio, { href: '//evil.example/x' })?.href).toBeNull()
    expect(trackFromAudio(audio, { href: null })?.href).toBeNull()
  })
})

describe('isPlayableSrc', () => {
  it('takes a site path or https, and nothing else', () => {
    expect(isPlayableSrc('/api/audio/file/a.mp3')).toBe(true)
    expect(isPlayableSrc('https://cdn.example.org/a.mp3')).toBe(true)
    expect(isPlayableSrc('//cdn.example.org/a.mp3')).toBe(false)
    expect(isPlayableSrc('data:audio/mp3;base64,AAAA')).toBe(false)
    expect(isPlayableSrc(undefined)).toBe(false)
  })
})

describe('seeking', () => {
  it('keeps a seek inside the audio', () => {
    expect(clampSeek(-5, 100)).toBe(0)
    expect(clampSeek(130, 100)).toBe(100)
    expect(clampSeek(42, 100)).toBe(42)
    expect(clampSeek(42, 0)).toBe(42)
    expect(clampSeek(Number.NaN, 100)).toBe(0)
  })

  it('reads the position in words', () => {
    expect(progressWords(83, 457)).toBe('1:23 of 7:37')
    expect(progressWords(3725, 7300)).toBe('1:02:05 of 2:01:40')
    expect(progressWords(9, 0)).toBe('0:09')
  })
})
