import { describe, expect, it } from 'vitest'

import { readListeningConfig } from './config'

const SECRET = 's'.repeat(32)

describe('readListeningConfig', () => {
  it('reads an https origin and a long enough secret', () => {
    expect(readListeningConfig({ PORTAL_ORIGIN: 'https://tools.example.org', PORTAL_LISTENING_SECRET: SECRET })).toEqual({
      origin: 'https://tools.example.org',
      secret: SECRET,
    })
  })

  it('tolerates a trailing slash and spaces', () => {
    expect(readListeningConfig({ PORTAL_ORIGIN: ' https://tools.example.org/ ', PORTAL_LISTENING_SECRET: SECRET })?.origin).toBe('https://tools.example.org')
  })

  it('allows http only for localhost', () => {
    expect(readListeningConfig({ PORTAL_ORIGIN: 'http://localhost:3001', PORTAL_LISTENING_SECRET: SECRET })?.origin).toBe('http://localhost:3001')
    expect(readListeningConfig({ PORTAL_ORIGIN: 'http://tools.example.org', PORTAL_LISTENING_SECRET: SECRET })).toBeNull()
  })

  it('is null when either value is missing, the secret is short, or the origin carries more than an origin', () => {
    expect(readListeningConfig({ PORTAL_LISTENING_SECRET: SECRET })).toBeNull()
    expect(readListeningConfig({ PORTAL_ORIGIN: 'https://tools.example.org' })).toBeNull()
    expect(readListeningConfig({ PORTAL_ORIGIN: 'https://tools.example.org', PORTAL_LISTENING_SECRET: 'short' })).toBeNull()
    for (const bad of ['not a url', 'https://tools.example.org/api', 'https://tools.example.org/?a=1', 'https://u:p@tools.example.org']) {
      expect(readListeningConfig({ PORTAL_ORIGIN: bad, PORTAL_LISTENING_SECRET: SECRET })).toBeNull()
    }
  })
})
