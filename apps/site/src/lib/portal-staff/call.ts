import { isStaffActionErrorCode, signRequest, STAFF_ACTIONS_PATH_PREFIX, type StaffActionErrorCode } from '@wuwf/portal-contracts'

import type { FetchLike } from '../listening/portal-call'
import type { StaffActionsConfig } from './config'

/**
 * The site's one door to the Portal's staff actions API. A POST with a JSON body signed over those exact bytes with the staff actions secret,
 * from the server only. A body is never logged (a question can name people): only the path and the refusal code are.
 * `message` is a sentence the Portal wrote for the person who typed it, passed on as it is.
 */
export type StaffActionCall<T> = ({ ok: true } & T) | { ok: false; error: StaffActionErrorCode | 'not_set_up'; message?: string }

const TIMEOUT_MS = 15_000

export async function callStaffActionWith<T extends object>(
  config: StaffActionsConfig | null,
  fetchImpl: FetchLike,
  path: string,
  body: Record<string, unknown>,
  now?: number,
): Promise<StaffActionCall<T>> {
  if (!config) return { ok: false, error: 'not_set_up' }
  // Only this channel's own paths are ever signed with its secret.
  if (!path.startsWith(`${STAFF_ACTIONS_PATH_PREFIX}/`)) throw new Error('A staff action must be under the staff actions prefix.')

  const json = JSON.stringify(body)
  const headers = await signRequest({ method: 'POST', path, body: json, ...(now === undefined ? {} : { now }) }, config.secret)

  let response: Response
  try {
    response = await fetchImpl(`${config.origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers, ...(config.bypass ? { 'x-vercel-protection-bypass': config.bypass } : {}) },
      body: json,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    console.error(`Staff actions: the Portal could not be reached for ${path}: ${error instanceof Error ? error.name : 'unknown error'}`)
    return { ok: false, error: 'unavailable' }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    console.error(`Staff actions: ${path} answered ${response.status} with something that is not JSON`)
    return { ok: false, error: 'unavailable' }
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return { ok: false, error: 'unavailable' }
  const record = payload as Record<string, unknown>

  if (record['ok'] === true) return record as { ok: true } & T
  if (isStaffActionErrorCode(record['error'])) {
    if (record['error'] === 'unavailable') console.error(`Staff actions: ${path} answered unavailable`)
    const message = typeof record['message'] === 'string' && record['message'].length <= 400 ? record['message'] : undefined
    return { ok: false, error: record['error'], ...(message ? { message } : {}) }
  }
  console.error(`Staff actions: ${path} answered ${response.status} with no usable code`)
  return { ok: false, error: 'unavailable' }
}
