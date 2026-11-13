import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './config'

/**
 * The embedding provider, behind an interface so it can be replaced (CLAUDE.md: third-party integrations sit behind interfaces).
 * The one implementation calls OpenAI's embeddings endpoint with `fetch`; there is no SDK dependency. Server only: the key never
 * reaches a browser.
 */

export interface EmbeddingProvider {
  readonly model: string
  readonly dimensions: number
  /** One vector per input, in order. Throws on failure; the caller decides whether that matters (a save never fails because of it). */
  embed(inputs: string[], options?: { signal?: AbortSignal }): Promise<number[][]>
}

type Fetch = typeof fetch

const ENDPOINT = 'https://api.openai.com/v1/embeddings'
/** OpenAI accepts up to 2,048 inputs and about 300,000 tokens per request; stay far inside both. */
export const MAX_INPUTS_PER_REQUEST = 64
const RETRIES = 3

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function openAiProvider(apiKey: string, options: { fetch?: Fetch; baseDelayMs?: number } = {}): EmbeddingProvider {
  const doFetch = options.fetch ?? fetch
  const baseDelay = options.baseDelayMs ?? 500

  async function request(inputs: string[], signal?: AbortSignal): Promise<number[][]> {
    let lastStatus = 0
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const response = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs, encoding_format: 'float' }),
        signal,
      })
      if (response.ok) {
        const json = (await response.json()) as { data?: { index: number; embedding: number[] }[] }
        const rows = [...(json.data ?? [])].sort((a, b) => a.index - b.index)
        if (rows.length !== inputs.length) throw new Error(`Embedding provider returned ${rows.length} vectors for ${inputs.length} inputs`)
        for (const row of rows) {
          if (row.embedding.length !== EMBEDDING_DIMENSIONS) {
            throw new Error(`Embedding provider returned ${row.embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`)
          }
        }
        return rows.map((r) => r.embedding)
      }
      lastStatus = response.status
      // Rate limits and server errors are worth another try; a bad request or a bad key is not. The body is never logged: it can echo input.
      if (response.status !== 429 && response.status < 500) break
      await wait(baseDelay * 2 ** attempt)
    }
    throw new Error(`Embedding request failed (HTTP ${lastStatus})`)
  }

  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(inputs, opts) {
      if (inputs.length === 0) return []
      const out: number[][] = []
      for (let i = 0; i < inputs.length; i += MAX_INPUTS_PER_REQUEST) {
        out.push(...(await request(inputs.slice(i, i + MAX_INPUTS_PER_REQUEST), opts?.signal)))
      }
      return out
    },
  }
}
