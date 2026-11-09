import { signRequest, isListeningErrorCode, type ListeningErrorCode, type ListeningPath } from '@wuwf/portal-contracts'

import type { ListeningConfig } from './config'

/**
 * The site's one door to the Portal's listening API (docs/audience-listening-suite-design.md §4). Every call is a POST with a
 * JSON body signed over those exact bytes with the listening channel's own secret. It runs on the server only: the secret
 * never reaches a browser, and a browser never calls the Portal's API (it uploads audio to the signed address the Portal
 * hands back, and nothing else).
 *
 * A body is never logged. Answers carry names, email addresses and phone numbers; only the path and the refusal code are.
 */
export type PortalCall<T> = ({ ok: true } & T) | { ok: false; error: ListeningErrorCode | 'not_set_up' }

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

/** How long a listening call may take before it is treated as the Portal being unavailable. */
const TIMEOUT_MS = 15_000

export async function callListeningWith<T extends object>(
  config: ListeningConfig | null,
  fetchImpl: FetchLike,
  path: ListeningPath,
  body: Record<string, unknown>,
  now?: number,
): Promise<PortalCall<T>> {
  if (!config) return { ok: false, error: 'not_set_up' }

  const json = JSON.stringify(body)
  const headers = await signRequest({ method: 'POST', path, body: json, ...(now === undefined ? {} : { now }) }, config.secret)

  let response: Response
  try {
    response = await fetchImpl(`${config.origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: json,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    console.error(`Listening: the Portal could not be reached for ${path}: ${error instanceof Error ? error.name : 'unknown error'}`)
    return { ok: false, error: 'unavailable' }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    console.error(`Listening: ${path} answered ${response.status} with something that is not JSON`)
    return { ok: false, error: 'unavailable' }
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return { ok: false, error: 'unavailable' }
  const record = payload as Record<string, unknown>

  if (record['ok'] === true) return record as { ok: true } & T
  if (isListeningErrorCode(record['error'])) {
    if (record['error'] === 'unavailable') console.error(`Listening: ${path} answered unavailable`)
    return { ok: false, error: record['error'] }
  }
  console.error(`Listening: ${path} answered ${response.status} with no usable code`)
  return { ok: false, error: 'unavailable' }
}
