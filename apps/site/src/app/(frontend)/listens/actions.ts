'use server'

import {
  LISTENING_PATHS,
  MAX_TEXT_ANSWER_LENGTH,
  type ListeningProgressAnswer,
  type ListeningUpload,
} from '@wuwf/portal-contracts'

import { callListening } from '@/lib/listening/portal'
import { currentClientHash, currentVisitorSubject } from '@/lib/listening/request-context'
import { failure, isPublicId, isUuid, pickConsent, pickDetails, type ActionResult } from '@/lib/listening/results'

/**
 * Every server action of the listening screens (docs/audience-listening-suite-design.md §4). Each runs on the server, asserts
 * this visitor as the subject, signs the call to the Portal, and hands the browser only what it needs. The Portal decides
 * everything (the open window, the limits, the question snapshot, consent); nothing is decided here. No answer, name or
 * address is written to a log.
 */
async function authored(): Promise<{ subject: NonNullable<Awaited<ReturnType<typeof currentVisitorSubject>>>; clientHash?: string }> {
  const subject = await currentVisitorSubject(true)
  if (!subject) throw new Error('A visitor could not be created.')
  const clientHash = await currentClientHash()
  return { subject, ...(clientHash ? { clientHash } : {}) }
}

export interface StartedResponse {
  submissionId: string
  resumed: boolean
  answers: ListeningProgressAnswer[]
}

/** Opens this visitor's response to a question, or resumes it, and reports the answers already saved. */
export async function startResponse(publicId: string): Promise<ActionResult<StartedResponse>> {
  if (!isPublicId(publicId)) return failure('invalid_request')
  const base = await authored()

  const started = await callListening<{ submissionId: string; resumed: boolean }>(LISTENING_PATHS.start, { publicId, ...base })
  if (!started.ok) return failure(started.error)

  let answers: ListeningProgressAnswer[] = []
  if (started.resumed) {
    const progress = await callListening<{ answers: ListeningProgressAnswer[] }>(LISTENING_PATHS.progress, { submissionId: started.submissionId, ...base })
    if (progress.ok) answers = progress.answers
  }
  return { ok: true, submissionId: started.submissionId, resumed: started.resumed, answers }
}

export interface ReservedAnswer {
  answerId: string
  upload: ListeningUpload
  maxDurationSeconds: number
}

/** Makes the row for an audio answer and returns the signed address the browser uploads to directly. */
export async function reserveAnswer(input: { submissionId: string; questionId: string; contentType: string }): Promise<ActionResult<ReservedAnswer>> {
  if (!isUuid(input.submissionId) || !isUuid(input.questionId) || typeof input.contentType !== 'string' || input.contentType.length > 100) return failure('invalid_request')
  const base = await authored()
  const result = await callListening<ReservedAnswer>(LISTENING_PATHS.reserveAnswer, {
    submissionId: input.submissionId,
    questionId: input.questionId,
    contentType: input.contentType,
    ...base,
  })
  if (!result.ok) return failure(result.error)
  return { ok: true, answerId: result.answerId, upload: result.upload, maxDurationSeconds: result.maxDurationSeconds }
}

/** Tells the Portal the browser's upload finished, so it checks the object and marks the answer saved. */
export async function completeAnswer(input: { answerId: string; sizeBytes: number; durationMs: number | null }): Promise<ActionResult<Record<never, never>>> {
  if (!isUuid(input.answerId) || !Number.isInteger(input.sizeBytes) || input.sizeBytes < 1) return failure('invalid_request')
  if (input.durationMs !== null && (!Number.isInteger(input.durationMs) || input.durationMs < 0)) return failure('invalid_request')
  const base = await authored()
  const result = await callListening<Record<never, never>>(LISTENING_PATHS.completeAnswer, {
    answerId: input.answerId,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs,
    ...base,
  })
  return result.ok ? { ok: true } : failure(result.error)
}

/** A written answer, where the question allows one. */
export async function saveTextAnswer(input: { submissionId: string; questionId: string; text: string }): Promise<ActionResult<{ answerId: string }>> {
  if (!isUuid(input.submissionId) || !isUuid(input.questionId) || typeof input.text !== 'string') return failure('invalid_request')
  const text = input.text.trim()
  if (text.length === 0) return failure('no_answers')
  if (text.length > MAX_TEXT_ANSWER_LENGTH) return failure('invalid_size')
  const base = await authored()
  const result = await callListening<{ answerId: string }>(LISTENING_PATHS.saveTextAnswer, { submissionId: input.submissionId, questionId: input.questionId, text, ...base })
  return result.ok ? { ok: true, answerId: result.answerId } : failure(result.error)
}

export interface SavedDetails {
  details: { name: string | null; email: string | null; phone: string | null; city: string | null; note: string | null }
  consent: { contact: boolean; identify: boolean; requestAnonymous: boolean }
}

/** The participant details and the three permissions, saved to the open response. */
export async function saveDetails(input: { submissionId: string } & SavedDetails): Promise<ActionResult<Record<never, never>>> {
  const details = pickDetails(input.details)
  const consent = pickConsent(input.consent)
  if (!isUuid(input.submissionId) || !details || !consent) return failure('invalid_request')
  const base = await authored()
  const result = await callListening<Record<never, never>>(LISTENING_PATHS.saveDetails, {
    submissionId: input.submissionId,
    details,
    consent,
    ...base,
  })
  return result.ok ? { ok: true } : failure(result.error)
}

/** Sends the response. `consentAgreed` is the terms box; the Portal refuses without it. */
export async function finalizeResponse(input: { submissionId: string; consentAgreed: boolean }): Promise<ActionResult<{ answers: number }>> {
  if (!isUuid(input.submissionId) || typeof input.consentAgreed !== 'boolean') return failure('invalid_request')
  const base = await authored()
  const result = await callListening<{ answers: number }>(LISTENING_PATHS.finalize, {
    submissionId: input.submissionId,
    consentAgreed: input.consentAgreed,
    ...base,
  })
  return result.ok ? { ok: true, answers: result.answers } : failure(result.error)
}
