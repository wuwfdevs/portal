'use server'

import {
  LISTENING_MAX_SEGMENTS,
  LISTENING_PATHS,
  LISTENING_TABLE_EVENTS,
  type ListeningConversation,
  type ListeningTable,
  type ListeningTableEvent,
  type ListeningUpload,
} from '@wuwf/portal-contracts'
import { isAllowedAnswerType, normalizeContentType } from '@wuwf/listening-core'

import { callListening } from '@/lib/listening/portal'
import { currentClientHash } from '@/lib/listening/request-context'
import { failure, isUuid, type ActionResult } from '@/lib/listening/results'
import { dropTableSession, holdTableSession, isTableLinkToken, readConversationSessions, readTableSession } from '@/lib/listening/table-session'
import { checkFacilitator } from '@/lib/listening/table'

/**
 * The server actions of a table's phone and of the facilitator's after-page (boards 5d to 5f, docs/audience-listening-suite-design.md
 * §2 and §4). A person at a table is not a subject: the table is authorised by the session the Portal issued when its link was
 * redeemed. The site holds that session in an httpOnly cookie, so these actions read it; the browser never sees it, and never sends
 * one. Everything a browser does send is picked field by field and checked before it is signed. Nothing here is logged.
 */
async function withSession<T extends object>(
  run: (session: string, clientHash: Record<string, string>) => Promise<ActionResult<T>>,
  read: () => Promise<string[]> = async () => [await readTableSession()].filter((s): s is string => s !== null),
): Promise<ActionResult<T>> {
  const sessions = await read()
  if (sessions.length === 0) return failure('not_found')
  const hash = await currentClientHash()
  const base: Record<string, string> = hash ? { clientHash: hash } : {}
  let last: ActionResult<T> = failure('not_found')
  for (const session of sessions) {
    last = await run(session, base)
    // A token the Portal does not know (replaced, or run out) must not hide one that still works; any other answer is final.
    if (last.ok || last.code !== 'not_found') return last
  }
  return last
}

/**
 * Redeems the table's single-use link and keeps the session for this phone. Called by a press, never on page load: a link
 * previewer or a prefetch must not use up a printed card.
 */
export async function openTable(linkToken: string): Promise<ActionResult<{ table: ListeningTable }>> {
  if (!isTableLinkToken(linkToken)) return failure('invalid_request')
  const hash = await currentClientHash()
  const result = await callListening<{ session: { token: string; expiresAt: string }; table: ListeningTable }>(LISTENING_PATHS.tableOpen, {
    linkToken,
    ...(hash ? { clientHash: hash } : {}),
  })
  if (!result.ok) return failure(result.error)
  await holdTableSession(result.session.token, result.session.expiresAt)
  return { ok: true, table: result.table }
}

/** Where this table is now: the phone's poll, and what a reopened page starts from. */
export async function readTable(): Promise<ActionResult<{ table: ListeningTable }>> {
  return withSession(async (session, base) => {
    const result = await callListening<{ table: ListeningTable }>(LISTENING_PATHS.tableState, { session, ...base })
    return result.ok ? { ok: true, table: result.table } : failure(result.error)
  })
}

/**
 * The facilitator's tap after the consent is read aloud. The version is the one the phone showed; the email is where WUWF sends the
 * one link to the after-page, and the Portal never sends it back.
 */
export async function agreeTable(input: { consentVersion: number; firstName: string | null; email: string }): Promise<ActionResult<{ table: ListeningTable }>> {
  if (!Number.isInteger(input.consentVersion) || input.consentVersion < 1) return failure('invalid_request')
  if (typeof input.email !== 'string' || (input.firstName !== null && typeof input.firstName !== 'string')) return failure('invalid_request')
  const facilitator = checkFacilitator({ firstName: input.firstName ?? '', email: input.email })
  if (!facilitator.ok) return { ...failure('required_field_missing'), message: facilitator.message }
  return withSession(async (session, base) => {
    const result = await callListening<{ table: ListeningTable }>(LISTENING_PATHS.tableAgree, {
      session,
      consentVersion: input.consentVersion,
      firstName: facilitator.value.firstName,
      email: facilitator.value.email,
      ...base,
    })
    return result.ok ? { ok: true, table: result.table } : failure(result.error)
  })
}

/** start, pause, resume, help, help-clear, or move to a prompt. */
export async function updateTable(input: { event: ListeningTableEvent; promptPosition?: number }): Promise<ActionResult<{ table: ListeningTable }>> {
  if (!(LISTENING_TABLE_EVENTS as readonly string[]).includes(input.event)) return failure('invalid_request')
  if (input.event === 'prompt' && (!Number.isInteger(input.promptPosition) || (input.promptPosition as number) < 0)) return failure('invalid_request')
  return withSession(async (session, base) => {
    const result = await callListening<{ table: ListeningTable }>(LISTENING_PATHS.tableUpdate, {
      session,
      event: input.event,
      ...(input.event === 'prompt' ? { promptPosition: input.promptPosition } : {}),
      ...base,
    })
    return result.ok ? { ok: true, table: result.table } : failure(result.error)
  })
}

/** Makes the row for one segment and returns the signed address the phone puts the audio to, or says the Portal already has it. */
export async function reserveSegment(input: { seq: number; contentType: string }): Promise<ActionResult<{ alreadyUploaded: true } | { upload: ListeningUpload }>> {
  if (!Number.isInteger(input.seq) || input.seq < 0 || input.seq >= LISTENING_MAX_SEGMENTS) return failure('invalid_request')
  if (typeof input.contentType !== 'string' || input.contentType.length > 100) return failure('invalid_request')
  const contentType = normalizeContentType(input.contentType)
  if (!isAllowedAnswerType(contentType)) return failure('unsupported_type')
  return withSession(async (session, base) => {
    const result = await callListening<{ seq: number; alreadyUploaded?: true; upload?: ListeningUpload }>(LISTENING_PATHS.tableSegment, {
      session,
      seq: input.seq,
      contentType,
      ...base,
    })
    if (!result.ok) return failure(result.error)
    if (result.alreadyUploaded) return { ok: true, alreadyUploaded: true as const }
    if (!result.upload) return failure('unavailable')
    return { ok: true, upload: result.upload }
  })
}

/** Tells the Portal the segment's upload finished, so it checks the object. */
export async function completeSegment(input: { seq: number; sizeBytes: number; durationMs: number }): Promise<ActionResult<Record<never, never>>> {
  if (!Number.isInteger(input.seq) || input.seq < 0 || input.seq >= LISTENING_MAX_SEGMENTS) return failure('invalid_request')
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1) return failure('invalid_request')
  if (!Number.isInteger(input.durationMs) || input.durationMs < 0) return failure('invalid_request')
  return withSession(async (session, base) => {
    const result = await callListening<Record<never, never>>(LISTENING_PATHS.tableSegmentComplete, {
      session,
      seq: input.seq,
      sizeBytes: input.sizeBytes,
      durationMs: input.durationMs,
      ...base,
    })
    return result.ok ? { ok: true } : failure(result.error)
  })
}

/** The table is over. `lastSeq` is the highest segment the phone made, or -1; the reply names any the Portal still lacks. */
export async function endTable(lastSeq: number): Promise<ActionResult<{ complete: boolean; missing: number[] }>> {
  if (!Number.isInteger(lastSeq) || lastSeq < -1 || lastSeq >= LISTENING_MAX_SEGMENTS) return failure('invalid_request')
  return withSession(async (session, base) => {
    const result = await callListening<{ complete: boolean; missing: number[] }>(LISTENING_PATHS.tableEnd, { session, lastSeq, ...base })
    return result.ok ? { ok: true, complete: result.complete, missing: result.missing } : failure(result.error)
  })
}

/** Lets this phone go: used to open a different table's card. The Portal's session is not touched. */
export async function leaveTable(): Promise<{ ok: true }> {
  await dropTableSession()
  return { ok: true }
}

// ---------------------------------------------------------------------------------------------------------------
// After the table

/** Only this table's conversation, rendered and dropped: the site keeps none of it. */
export async function readConversation(): Promise<ActionResult<{ conversation: ListeningConversation }>> {
  return withSession(async (session, base) => {
    const result = await callListening<{ conversation: ListeningConversation }>(LISTENING_PATHS.conversation, { session, ...base })
    return result.ok ? { ok: true, conversation: result.conversation } : failure(result.error)
  }, readConversationSessions)
}

/** Names and merges, sent whole. Each voice is picked by name; nothing a browser sends is spread into the signed body. */
export async function saveSpeakers(input: { speakers: { id: string; name: string | null; isFacilitator: boolean; mergedInto: string | null }[] }): Promise<ActionResult<Record<never, never>>> {
  if (!Array.isArray(input.speakers) || input.speakers.length > 50) return failure('invalid_request')
  const speakers: { id: string; name: string | null; isFacilitator: boolean; mergedInto: string | null }[] = []
  for (const s of input.speakers) {
    if (typeof s !== 'object' || s === null || !isUuid(s.id) || typeof s.isFacilitator !== 'boolean') return failure('invalid_request')
    if (s.name !== null && (typeof s.name !== 'string' || s.name.length > 100)) return failure('invalid_request')
    if (s.mergedInto !== null && !isUuid(s.mergedInto)) return failure('invalid_request')
    speakers.push({ id: s.id, name: s.name === null ? null : s.name.trim() || null, isFacilitator: s.isFacilitator, mergedInto: s.mergedInto })
  }
  return withSession(async (session, base) => {
    const result = await callListening<Record<never, never>>(LISTENING_PATHS.speakersSave, { session, speakers, ...base })
    return result.ok ? { ok: true } : failure(result.error)
  }, readConversationSessions)
}

/** The lines that mattered, by where each starts. The Portal copies the words itself; the site never supplies them. */
export async function saveHighlights(input: { highlights: { startMs: number; tag: string | null }[] }): Promise<ActionResult<Record<never, never>>> {
  if (!Array.isArray(input.highlights) || input.highlights.length > 500) return failure('invalid_request')
  const highlights: { startMs: number; tag: string | null }[] = []
  for (const h of input.highlights) {
    if (typeof h !== 'object' || h === null || !Number.isInteger(h.startMs) || h.startMs < 0) return failure('invalid_request')
    if (h.tag !== null && (typeof h.tag !== 'string' || h.tag.length > 100)) return failure('invalid_request')
    highlights.push({ startMs: h.startMs, tag: h.tag })
  }
  return withSession(async (session, base) => {
    const result = await callListening<Record<never, never>>(LISTENING_PATHS.highlightsSave, { session, highlights, ...base })
    return result.ok ? { ok: true } : failure(result.error)
  }, readConversationSessions)
}

/** Sends the conversation to the station. It can still be read afterwards, not changed. */
export async function sendConversation(): Promise<ActionResult<Record<never, never>>> {
  return withSession(async (session, base) => {
    const result = await callListening<Record<never, never>>(LISTENING_PATHS.conversationSend, { session, ...base })
    return result.ok ? { ok: true } : failure(result.error)
  }, readConversationSessions)
}
