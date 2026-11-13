import { describe, expect, it } from 'vitest'

import { embeddingKey, semanticSearchAllowed } from './config'

describe('embeddingKey', () => {
  it('is the key, trimmed, or null when unset or blank', () => {
    expect(embeddingKey({ OPENAI_API_KEY: ' sk-abc ' })).toBe('sk-abc')
    expect(embeddingKey({ OPENAI_API_KEY: '   ' })).toBeNull()
    expect(embeddingKey({})).toBeNull()
  })
})

describe('semanticSearchAllowed', () => {
  const withKey = { OPENAI_API_KEY: 'sk-abc' }
  it('needs both the key and the Site settings switch', () => {
    expect(semanticSearchAllowed(true, withKey)).toBe(true)
    expect(semanticSearchAllowed(false, withKey)).toBe(false)
    expect(semanticSearchAllowed(true, {})).toBe(false)
  })
  it('treats an unset switch (an older database, a new field) as off', () => {
    expect(semanticSearchAllowed(undefined, withKey)).toBe(false)
    expect(semanticSearchAllowed(null, withKey)).toBe(false)
  })
  it('is not turned on by the old environment variable', () => {
    expect(semanticSearchAllowed(false, { ...withKey, SEMANTIC_SEARCH: 'on' })).toBe(false)
  })
})
