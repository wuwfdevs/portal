import { describe, expect, it } from 'vitest'

import { ctaLabelOf, groupIntoRows, nextClip, normalizeVtt, validateVtt, type ClipCard } from './clips'

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nEight feet.\n'

describe('validateVtt', () => {
  it('accepts a header and a timed cue, with or without hours', () => {
    expect(validateVtt(VTT)).toBe(true)
    expect(validateVtt('WEBVTT - title\n\n01:00:01.000 --> 01:00:03.500\nHi')).toBe(true)
    expect(validateVtt('﻿' + VTT)).toBe(true)
    expect(validateVtt('WEBVTT\r\n\r\n00:00:01.000 --> 00:00:03.000\r\nEight feet.\r\n')).toBe(true) // an API client may send Windows line endings
  })
  it('refuses nothing, the wrong format and a header with no cues', () => {
    for (const bad of [null, undefined, '', '   ', '1\n00:00:01,000 --> 00:00:03,000\nSRT', 'WEBVTTX\n\n00:00:01.000 --> 00:00:02.000\nx', 'WEBVTT\n\nno cues here']) {
      expect(typeof validateVtt(bad as never)).toBe('string')
    }
  })
})

describe('normalizeVtt', () => {
  it('uses plain line endings and ends in one newline', () => {
    expect(normalizeVtt('WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nx\r\n\r\n')).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nx\n')
  })
})

const clip = (slug: string, publishedAt: string | null, series: ClipCard['series']): ClipCard => ({ slug, title: slug, publishedAt, series })
const isaias = { slug: 'after-isaias', title: 'After Isaias' }
const live = { slug: 'radiolive-moments', title: 'RadioLive moments' }

describe('groupIntoRows', () => {
  const clips = [clip('a', '2026-01-01T00:00:00Z', isaias), clip('b', '2026-03-01T00:00:00Z', live), clip('c', '2026-02-01T00:00:00Z', isaias), clip('loose', '2026-12-01T00:00:00Z', null), clip('undated', null, live)]
  const rows = groupIntoRows(clips)
  it('makes one row per series, ordered by their newest clip, each row newest first', () => {
    expect(rows.map((r) => r.key)).toEqual(['radiolive-moments', 'after-isaias', 'more'])
    expect(rows[1]!.items.map((c) => c.slug)).toEqual(['c', 'a'])
    expect(rows[0]!.items.map((c) => c.slug)).toEqual(['b', 'undated'])
  })
  it('puts clips with no series last, however new, so nothing published is hidden', () => {
    expect(rows.at(-1)).toMatchObject({ key: 'more', name: 'More video' })
    expect(rows.at(-1)!.items.map((c) => c.slug)).toEqual(['loose'])
  })
  it('cuts a row to the limit and makes no empty rows', () => {
    expect(groupIntoRows(clips, 1).find((r) => r.key === 'after-isaias')!.items.map((c) => c.slug)).toEqual(['c'])
    expect(groupIntoRows([])).toEqual([])
  })
})

describe('nextClip', () => {
  const list = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]
  it('is the following clip, wrapping at the end', () => {
    expect(nextClip(list, 'a')?.slug).toBe('b')
    expect(nextClip(list, 'c')?.slug).toBe('a')
  })
  it('is nothing when there is no other clip', () => {
    expect(nextClip([{ slug: 'a' }], 'a')).toBeNull()
    expect(nextClip([], 'a')).toBeNull()
  })
})

describe('ctaLabelOf', () => {
  it('is the editor\'s label or "Read the story"', () => {
    expect(ctaLabelOf(' Hear the episode ')).toBe('Hear the episode')
    expect(ctaLabelOf('  ')).toBe('Read the story')
    expect(ctaLabelOf(null)).toBe('Read the story')
  })
})
