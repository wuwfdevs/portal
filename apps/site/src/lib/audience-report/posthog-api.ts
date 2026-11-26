import { POSTHOG_UI_HOST } from '@/lib/analytics/posthog-config'

import type { Rows } from './shape'

/**
 * The one place the site's server reads from PostHog, for the Audience screen. Server only: the key is a secret and never reaches a browser
 * (it is read from a variable without the NEXT_PUBLIC_ prefix, so Next never puts it in a page; `load.ts`, the only caller, is `server-only`).
 *
 * `POSTHOG_PERSONAL_API_KEY` is a **read-only** personal API key (scope `query:read`), a different thing from the public project token the
 * browser uses (`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`); `POSTHOG_PROJECT_ID` is the project's number. Unset means "not set up": the screen says
 * so, nothing is fetched. A response body from PostHog is never put in an error, a log or a screen: only its status.
 */

type Env = Record<string, string | undefined>

export interface PostHogReadConfig {
  key: string
  projectId: string
}

export function posthogReadConfig(env: Env = process.env): PostHogReadConfig | null {
  const key = env.POSTHOG_PERSONAL_API_KEY?.trim()
  const projectId = env.POSTHOG_PROJECT_ID?.trim()
  if (!key || !projectId || !/^\d+$/.test(projectId)) return null
  return { key, projectId }
}

/** The project in PostHog's own app, for "Open in PostHog". */
export const posthogProjectUrl = (projectId: string): string => `${POSTHOG_UI_HOST}/project/${projectId}`

export type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Run one HogQL query and return its rows. Throws with the status only. */
export async function runHogQL(config: PostHogReadConfig, query: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Rows> {
  const res = await fetchImpl(`${POSTHOG_UI_HOST}/api/projects/${config.projectId}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`PostHog returned an error (${res.status}).`)
  const body = (await res.json()) as { results?: unknown }
  if (!Array.isArray(body.results)) throw new Error('PostHog returned no rows.')
  return body.results.filter((r): r is unknown[] => Array.isArray(r))
}
