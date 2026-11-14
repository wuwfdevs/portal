import { LISTENING_PATHS, verifyRequestSignature } from '@wuwf/portal-contracts'
import { describe, expect, it, vi } from 'vitest'

import { callListeningWith } from './portal-call'

const SECRET = 'k'.repeat(40)
const CONFIG = { origin: 'https://tools.example.org', secret: SECRET }

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
}

describe('callListeningWith: a Portal behind Vercel deployment protection', () => {
  const BYPASS = 'b'.repeat(32)
  const sentHeaders = async (config: Parameters<typeof callListeningWith>[0]) => {
    const fetchImpl = respond(200, { ok: true })
    await callListeningWith(config, fetchImpl, LISTENING_PATHS.start, { a: 1 }, 1_700_000_000)
    return (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
  }

  it('sends the bypass secret as a header when one is configured, and does not sign it into anything else', async () => {
    const headers = await sentHeaders({ ...CONFIG, bypass: BYPASS })
    expect(headers['x-vercel-protection-bypass']).toBe(BYPASS)
    expect(headers['x-wuwf-signature']).toBeTruthy()
  })

  it('sends no bypass header when none is configured', async () => {
    expect(await sentHeaders(CONFIG)).not.toHaveProperty('x-vercel-protection-bypass')
  })
})

describe('callListeningWith', () => {
  it('signs the exact body for the exact path, with the channel secret', async () => {
    const fetchImpl = respond(200, { ok: true, submissionId: 's1', resumed: false })
    const body = { subject: { kind: 'visitor', id: 'abc' }, publicId: 'abcd1234efgh5678' }
    const result = await callListeningWith(CONFIG, fetchImpl, LISTENING_PATHS.start, body, 1_700_000_000)

    expect(result).toEqual({ ok: true, submissionId: 's1', resumed: false })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://tools.example.org/api/site/listening/start')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    const verified = await verifyRequestSignature(
      {
        method: 'POST',
        path: '/api/site/listening/start',
        body: init.body as string,
        signature: headers['x-wuwf-signature'] ?? null,
        timestamp: headers['x-wuwf-timestamp'] ?? null,
        version: headers['x-wuwf-contract-version'] ?? null,
      },
      SECRET,
      1_700_000_000,
    )
    expect(verified).toEqual({ ok: true })
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('does not send anything when listening is not configured', async () => {
    const fetchImpl = respond(200, { ok: true })
    expect(await callListeningWith(null, fetchImpl, LISTENING_PATHS.query, { publicId: 'x' })).toEqual({ ok: false, error: 'not_set_up' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("passes the Portal's refusal code through", async () => {
    expect(await callListeningWith(CONFIG, respond(422, { ok: false, error: 'submission_limit' }), LISTENING_PATHS.start, {})).toEqual({
      ok: false,
      error: 'submission_limit',
    })
  })

  it('treats a network failure, a non-JSON answer and an unknown code as the Portal being unavailable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await callListeningWith(CONFIG, vi.fn(async () => Promise.reject(new Error('boom'))), LISTENING_PATHS.query, {})).toEqual({ ok: false, error: 'unavailable' })
    expect(await callListeningWith(CONFIG, respond(502, '<html>bad gateway</html>'), LISTENING_PATHS.query, {})).toEqual({ ok: false, error: 'unavailable' })
    expect(await callListeningWith(CONFIG, respond(400, { ok: false, error: 'made_up' }), LISTENING_PATHS.query, {})).toEqual({ ok: false, error: 'unavailable' })
    error.mockRestore()
  })

  it('never writes a request body to the log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await callListeningWith(CONFIG, vi.fn(async () => Promise.reject(new Error('boom'))), LISTENING_PATHS.saveDetails, { details: { email: 'someone@example.org' } })
    expect(JSON.stringify(error.mock.calls)).not.toContain('someone@example.org')
    error.mockRestore()
  })
})
