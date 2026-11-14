import { describe, expect, it } from 'vitest'

import { parsePortalOrigin, portalOriginProblem, readListeningConfig } from './config'

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

describe('the Portal address from Site settings', () => {
  const env = { PORTAL_ORIGIN: 'https://env.example.org', PORTAL_LISTENING_SECRET: SECRET }

  it('wins over the environment when it is filled in', () => {
    expect(readListeningConfig(env, 'https://tools.example.org')?.origin).toBe('https://tools.example.org')
    expect(readListeningConfig(env, ' https://tools.example.org/ ')?.origin).toBe('https://tools.example.org')
  })

  it('falls back to the environment when it is empty', () => {
    for (const empty of [undefined, null, '', '   ']) expect(readListeningConfig(env, empty)?.origin).toBe('https://env.example.org')
  })

  it('is not silently replaced by the environment when it is filled in wrongly', () => {
    expect(readListeningConfig(env, 'https://tools.example.org/path')).toBeNull()
    expect(readListeningConfig(env, 'http://tools.example.org')).toBeNull()
  })

  it('works with no PORTAL_ORIGIN at all, but never without the secret', () => {
    expect(readListeningConfig({ PORTAL_LISTENING_SECRET: SECRET }, 'https://tools.example.org')?.origin).toBe('https://tools.example.org')
    expect(readListeningConfig({ PORTAL_ORIGIN: 'https://env.example.org' }, 'https://tools.example.org')).toBeNull()
  })
})

describe('parsePortalOrigin and portalOriginProblem', () => {
  it('accepts an origin and nothing more', () => {
    expect(parsePortalOrigin('https://tools.example.org:8443')).toBe('https://tools.example.org:8443')
    expect(parsePortalOrigin('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001')
    for (const bad of ['', 'tools.example.org', 'https://tools.example.org/x', 'https://a:b@tools.example.org', 'ftp://tools.example.org']) {
      expect(parsePortalOrigin(bad)).toBeNull()
    }
  })

  it('says why an address cannot be used, and nothing about an empty one', () => {
    expect(portalOriginProblem(undefined)).toBeNull()
    expect(portalOriginProblem('  ')).toBeNull()
    expect(portalOriginProblem('https://tools.example.org')).toBeNull()
    expect(portalOriginProblem('https://tools.example.org/path')).toMatch(/address only/)
  })
})
