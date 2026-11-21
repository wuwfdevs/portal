'use client'

import { Button, useConfig, useFormFields } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { Example, EmbeddingStatus } from '@/lib/embeddings/admin'

/**
 * The "Story embeddings" panel under Site settings. It does in the admin what `scripts/embeddings/backfill.ts` does in a terminal: shows
 * how many stories have been embedded and embeds the rest, a batch at a time, and it shows a sample of stories with the stories the
 * current numbers would put under them, so the "how closely related" settings can be set by eye. Everything goes through the staff-only
 * endpoints in `globals/storyEmbeddingEndpoints.ts`. It never sees a key, a story's text or a vector.
 *
 * Written for the admin, so it uses Payload's own theme variables rather than the public site's design tokens.
 */

type RunResult =
  | { ok: true; embedded: number; leftOut: number; lastId: number; done: boolean; status: EmbeddingStatus }
  | { ok: false; error: string; status?: EmbeddingStatus }

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 16, background: 'var(--theme-elevation-50)' }
const muted: React.CSSProperties = { color: 'var(--theme-elevation-600)', margin: 0 }

export const StoryEmbeddingsPanel: React.FC = () => {
  const { config } = useConfig()
  const api = `${config.serverURL ?? ''}${config.routes.api}/globals/site-settings/embeddings`

  // The numbers on the form, saved or not, so the examples answer "what if I set it to this".
  const related = useFormFields(([fields]) => fields.relatedMinSimilarity?.value) as number | string | null | undefined
  const perSeries = useFormFields(([fields]) => fields.relatedMaxPerSeries?.value) as number | string | null | undefined

  const [status, setStatus] = useState<EmbeddingStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const stop = useRef(false)
  const [examples, setExamples] = useState<Example[] | null>(null)
  const [loadingExamples, setLoadingExamples] = useState(false)

  const call = useCallback(async (url: string, method: 'GET' | 'POST') => {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: { accept: 'application/json' } })
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : `The server answered ${response.status}.`)
    return body
  }, [])

  useEffect(() => {
    let cancelled = false
    call(api, 'GET')
      .then((body) => !cancelled && setStatus(body as unknown as EmbeddingStatus))
      .catch((error: Error) => !cancelled && setMessage(error.message))
    return () => {
      cancelled = true
    }
  }, [api, call])

  const run = async (all: boolean) => {
    setRunning(true)
    stop.current = false
    setMessage(null)
    let after = 0
    let total = 0
    try {
      for (;;) {
        const result = (await call(`${api}/run?after=${after}`, 'POST')) as unknown as RunResult
        if (result.status) setStatus(result.status)
        if (!result.ok) {
          setMessage(result.error)
          return
        }
        total += result.embedded
        after = result.lastId
        setMessage(`Embedded ${total} ${total === 1 ? 'story' : 'stories'} so far.`)
        if (!all || result.done || stop.current) {
          setMessage(result.done ? `Done. Embedded ${total} ${total === 1 ? 'story' : 'stories'} in this run.` : stop.current ? `Stopped after ${total}.` : `Embedded ${total} ${total === 1 ? 'story' : 'stories'}.`)
          return
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setRunning(false)
    }
  }

  const showExamples = async () => {
    setLoadingExamples(true)
    setMessage(null)
    try {
      const query = new URLSearchParams()
      if (related !== null && related !== undefined && String(related) !== '') query.set('related', String(related))
      if (perSeries !== null && perSeries !== undefined && String(perSeries) !== '') query.set('perSeries', String(perSeries))
      const body = (await call(`${api}/examples?${query.toString()}`, 'GET')) as unknown as { examples: Example[] }
      setExamples(body.examples)
      if (body.examples.length === 0) setMessage('No stories are embedded yet, so there is nothing to show. Embed some first.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setLoadingExamples(false)
    }
  }

  const done = status ? status.embedded : 0
  const total = status ? status.eligible : 0

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
      <div>
        <h3 style={{ margin: '0 0 4px' }}>Story embeddings</h3>
        <p style={muted}>
          Each of WUWF&rsquo;s own published stories is compared with the others, so a story page can offer related stories and search can find stories by meaning. Embedding sends a
          story&rsquo;s text to OpenAI once (a members-only story&rsquo;s headline and summary only, never its text; NPR and wire stories never). New and edited stories are embedded when
          they are saved; this embeds the ones that were already here.
        </p>
      </div>

      {status === null ? (
        <p style={muted}>{message ?? 'Checking…'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0 }}>
            <strong>{done.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong> published stories embedded
            {status.waiting > 0 ? ` (${status.waiting.toLocaleString()} waiting).` : '.'}
          </p>
          <progress aria-label="Stories embedded" max={Math.max(total, 1)} style={{ width: '100%' }} value={done} />
          {!status.keySet && (
            <p role="alert" style={{ margin: 0 }}>
              The server has no <code>OPENAI_API_KEY</code>, so nothing can be embedded yet.
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button buttonStyle="primary" disabled={running || !status.keySet || status.waiting === 0} onClick={() => run(false)} size="medium" type="button">
              Embed the next 20
            </Button>
            <Button buttonStyle="secondary" disabled={running || !status.keySet || status.waiting === 0} onClick={() => run(true)} size="medium" type="button">
              Embed all {status.waiting.toLocaleString()} waiting
            </Button>
            {running && (
              <Button buttonStyle="secondary" onClick={() => (stop.current = true)} size="medium" type="button">
                Stop after this batch
              </Button>
            )}
          </div>
        </div>
      )}

      {message && status !== null && (
        <p aria-live="polite" role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}

      <div style={{ borderTop: '1px solid var(--theme-elevation-150)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h4 style={{ margin: 0 }}>Examples</h4>
        <p style={muted}>
          Five stories picked at random, each with its closest stories and the closeness number. &ldquo;Shown&rdquo; means a reader would see it under that story with the numbers in the fields
          above (even before you save them). Change a number, press the button again, and read whether the right stories are on the line.
        </p>
        <div>
          <Button buttonStyle="secondary" disabled={loadingExamples || status === null || status.embedded === 0} onClick={showExamples} size="medium" type="button">
            {examples ? 'Pick five other stories' : 'Show examples'}
          </Button>
        </div>
        {examples && examples.length > 0 && (
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {examples.map((example) => (
              <li key={example.path}>
                <a href={example.path} rel="noreferrer" target="_blank">
                  <strong>{example.title}</strong>
                </a>
                <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  {example.neighbours.map((n) => (
                    <li key={n.path}>
                      <strong>{n.similarity.toFixed(2)}</strong> · {n.shown ? 'Shown' : 'Not shown'} ·{' '}
                      <a href={n.path} rel="noreferrer" target="_blank">
                        {n.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

export default StoryEmbeddingsPanel
