import { describe, expect, it } from 'vitest'

import { effectiveVariant, framingForFormat, placementVariant, publicIdFromInput } from './placement'

describe('publicIdFromInput', () => {
  it('takes the code itself', () => {
    expect(publicIdFromInput('abcd1234efgh5678')).toBe('abcd1234efgh5678')
    expect(publicIdFromInput('  abcd1234efgh5678 ')).toBe('abcd1234efgh5678')
  })
  it('takes the code from the question’s address', () => {
    expect(publicIdFromInput('https://www.wuwf.org/listens/abcd1234efgh5678')).toBe('abcd1234efgh5678')
    expect(publicIdFromInput('/listens/abcd1234efgh5678/')).toBe('abcd1234efgh5678')
    expect(publicIdFromInput('https://x.example/listens/abcd1234efgh5678?ref=a#b')).toBe('abcd1234efgh5678')
  })
  it('refuses anything else', () => {
    expect(publicIdFromInput('')).toBeNull()
    expect(publicIdFromInput(null)).toBeNull()
    expect(publicIdFromInput('ABCD1234EFGH5678')).toBeNull()
    expect(publicIdFromInput('/listens/short')).toBeNull()
    expect(publicIdFromInput('/listen/abcd1234efgh5678')).toBeNull()
    expect(publicIdFromInput('/listens/abcd1234efgh5678/extra')).toBeNull()
  })
})

describe('placementVariant', () => {
  it('reads voice, and defaults to the in-story ask', () => {
    expect(placementVariant('voice')).toBe('voice')
    expect(placementVariant('story')).toBe('story')
    expect(placementVariant(undefined)).toBe('story')
    expect(placementVariant('topic')).toBe('story')
  })
})

describe('framingForFormat', () => {
  it('leads with recording after an audio or video story, and is the in-story ask for any other', () => {
    expect(framingForFormat('audio')).toBe('voice')
    expect(framingForFormat('video')).toBe('voice')
    for (const other of ['standard', 'live', '', null, undefined]) expect(framingForFormat(other as never), String(other)).toBe('story')
  })
})

describe('effectiveVariant', () => {
  it('takes the story\'s framing for a block that was never saved as voice', () => {
    expect(effectiveVariant('story', 'voice')).toBe('voice')
    expect(effectiveVariant('story', 'story')).toBe('story')
    expect(effectiveVariant(undefined, 'voice')).toBe('voice')
    expect(effectiveVariant(null)).toBe('story')
  })
  it('keeps a block an editor saved as voice, even in a text story', () => {
    expect(effectiveVariant('voice', 'story')).toBe('voice')
    expect(effectiveVariant('voice')).toBe('voice')
  })
})
