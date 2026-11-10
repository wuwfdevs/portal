import { describe, expect, it } from 'vitest'

import { placementVariant, publicIdFromInput } from './placement'

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
