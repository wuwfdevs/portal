import { describe, expect, it, vi } from 'vitest'

import { EMBEDDING_DIMENSIONS } from './config'
import { MAX_INPUTS_PER_REQUEST, openAiProvider } from './provider'

const vec = (n = 0) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === n ? 1 : 0))
const ok = (inputs: number) =>
  new Response(JSON.stringify({ data: Array.from({ length: inputs }, (_, i) => ({ index: inputs - 1 - i, embedding: vec(inputs - 1 - i) })) }), { status: 200 })

describe('openAiProvider', () => {
  it('sends the key as a bearer token, the model and the inputs, and returns vectors in input order', async () => {
    const fetchMock = vi.fn(async () => ok(2))
    const out = await openAiProvider('sk-test', { fetch: fetchMock as never }).embed(['a', 'b'])
    expect(out).toHaveLength(2)
    expect(out[0][0]).toBe(1) // index 0 -> vec(0), even though the response listed it last
    expect(out[1][1]).toBe(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/embeddings')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'text-embedding-3-small', input: ['a', 'b'] })
  })

  it('splits a large batch into requests of the permitted size', async () => {
    const fetchMock = vi.fn(async (_u: unknown, init?: RequestInit) => ok(JSON.parse(init?.body as string).input.length))
    const inputs = Array.from({ length: MAX_INPUTS_PER_REQUEST + 5 }, (_, i) => `t${i}`)
    const out = await openAiProvider('k', { fetch: fetchMock as never }).embed(inputs)
    expect(out).toHaveLength(inputs.length)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does nothing for no inputs', async () => {
    const fetchMock = vi.fn()
    expect(await openAiProvider('k', { fetch: fetchMock as never }).embed([])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries a rate limit, then succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('slow down', { status: 429 })).mockResolvedValueOnce(ok(1))
    const out = await openAiProvider('k', { fetch: fetchMock as never, baseDelayMs: 1 }).embed(['a'])
    expect(out).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a bad key, and the error carries the status but never the response text', async () => {
    const fetchMock = vi.fn(async () => new Response('Incorrect API key sk-secret', { status: 401 }))
    const error = await openAiProvider('k', { fetch: fetchMock as never, baseDelayMs: 1 }).embed(['a']).catch((e: Error) => e)
    expect((error as Error).message).toBe('Embedding request failed (HTTP 401)')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after repeated server errors', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 503 }))
    await expect(openAiProvider('k', { fetch: fetchMock as never, baseDelayMs: 1 }).embed(['a'])).rejects.toThrow('HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('rejects a vector of the wrong width instead of storing it', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }] }), { status: 200 }))
    await expect(openAiProvider('k', { fetch: fetchMock as never }).embed(['a'])).rejects.toThrow('dimensions')
  })
})
