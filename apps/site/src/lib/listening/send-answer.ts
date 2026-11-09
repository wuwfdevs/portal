import type { ListeningUpload } from '@wuwf/portal-contracts'
import { MAX_ANSWER_BYTES, normalizeContentType } from '@wuwf/listening-core'

import { failure, type ActionFailure, type ActionResult } from './results'

/**
 * Sending one recorded answer: reserve the row, put the audio straight to the signed address the Portal issued, then tell the
 * Portal it arrived. The audio never passes through this site. The three steps are injected so the order and the failure
 * handling are tested without a network.
 *
 * "Saved" is said only after the Portal has confirmed the object (`completeAnswer`), never after the upload alone: a person
 * told their answer is kept who then loses it is the worst outcome this flow can produce.
 */
export interface AnswerSteps {
  reserve(input: { submissionId: string; questionId: string; contentType: string }): Promise<ActionResult<{ answerId: string; upload: ListeningUpload }>>
  upload(upload: ListeningUpload, blob: Blob): Promise<boolean>
  complete(input: { answerId: string; sizeBytes: number; durationMs: number | null }): Promise<ActionResult<Record<never, never>>>
}

export async function saveAudioAnswer(
  steps: AnswerSteps,
  input: { submissionId: string; questionId: string; blob: Blob; durationMs: number | null },
): Promise<{ ok: true; answerId: string } | ActionFailure> {
  const sizeBytes = input.blob.size
  if (sizeBytes < 1 || sizeBytes > MAX_ANSWER_BYTES) return failure('invalid_size')

  const contentType = normalizeContentType(input.blob.type)
  const reserved = await steps.reserve({ submissionId: input.submissionId, questionId: input.questionId, contentType })
  if (!reserved.ok) return reserved

  const uploaded = await steps.upload(reserved.upload, input.blob)
  // The row exists but holds no audio. It stays "pending" at the Portal and is replaced by the next try.
  if (!uploaded) return failure('unavailable')

  const completed = await steps.complete({ answerId: reserved.answerId, sizeBytes, durationMs: input.durationMs })
  if (!completed.ok) return completed
  return { ok: true, answerId: reserved.answerId }
}

/**
 * Puts the audio to the signed address as a raw body with exactly the headers the Portal gave (the content type is pinned to
 * the one reserved). Returns false for any refusal or network failure; the caller says "try again", and nothing is saved.
 *
 * Unverified against Supabase Storage until the first real upload: a signed upload URL taking a raw PUT body is assumed
 * from Storage's behaviour (docs/audience-listening-suite-design.md §4).
 */
export async function putToSignedUrl(upload: ListeningUpload, blob: Blob, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(upload.url, { method: upload.method, headers: upload.headers, body: blob })
    return response.ok
  } catch {
    return false
  }
}
