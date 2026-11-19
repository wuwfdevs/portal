import { describe, expect, it } from 'vitest'

import { cdsConfigured, cdsReader, cdsReaderFromEnv, type FetchLike } from './cds-client'

const answer = (ok: boolean, status: number, body: unknown = { resources: [] }) => ({ ok, status, json: async () => body })

describe('cdsReader', () => {
  it('sends the key as a bearer token and asks the documents endpoint', async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null
    const fetchImpl: FetchLike = async (url, init) => {
      seen = { url, headers: init.headers }
      return answer(true, 200, { resources: [{ id: 'a' }] })
    }
    const out = await cdsReader('secret-token', 'https://cds.example.org/v1/', fetchImpl).get('profileIds=story&limit=1')
    expect(out).toEqual({ resources: [{ id: 'a' }] })
    expect(seen!.url).toBe('https://cds.example.org/v1/documents?profileIds=story&limit=1')
    expect(seen!.headers.Authorization).toBe('Bearer secret-token')
  })

  it('says only the status when CDS refuses, never the body or the key', async () => {
    const fetchImpl: FetchLike = async () => answer(false, 403, { message: 'secret-token is not allowed' })
    const err = await cdsReader('secret-token', undefined, fetchImpl).get('x=1').catch((e: Error) => e)
    expect((err as Error).message).toBe('NPR CDS returned an error (403).')
  })

  it('refuses a base address that is not https, so the key is never sent in the clear', () => {
    expect(() => cdsReader('t', 'http://cds.example.org/v1')).toThrow(/https/)
  })
})

describe('from the environment', () => {
  it('is not set up without a key, and that is a state, not an error', () => {
    expect(cdsConfigured({})).toBe(false)
    expect(cdsConfigured({ NPR_CDS_TOKEN: '   ' })).toBe(false)
    expect(cdsReaderFromEnv({})).toBeNull()
  })

  it('builds a reader when a key is set', () => {
    expect(cdsConfigured({ NPR_CDS_TOKEN: 'abc' })).toBe(true)
    expect(cdsReaderFromEnv({ NPR_CDS_TOKEN: 'abc' })).not.toBeNull()
  })
})
