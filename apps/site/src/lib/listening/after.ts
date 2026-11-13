import type { ListeningConversation, ListeningHighlight, ListeningSpeaker, ListeningTranscriptLine } from '@wuwf/portal-contracts'

/**
 * The facilitator's after-page (board 5e): put names to the voices, mark the lines that mattered, send. This is the pure half.
 * The Portal holds the transcript and the words of every highlight; the page keeps only what the facilitator has done since it
 * opened, and sends it whole. Nothing here stores a transcript.
 */
export interface SpeakerEdit {
  id: string
  label: string
  name: string
  isFacilitator: boolean
  mergedInto: string | null
  firstHeardMs: number
  sharePercent: number
  /** A name the transcription heard the person say, to confirm. Never filled in by itself. */
  suggestedName: string | null
}

export interface MarkEdit {
  startMs: number
  tag: string | null
}

export function toSpeakerEdits(speakers: ListeningSpeaker[]): SpeakerEdit[] {
  return speakers.map((s) => ({ id: s.id, label: s.label, name: s.name ?? '', isFacilitator: s.isFacilitator, mergedInto: s.mergedInto, firstHeardMs: s.firstHeardMs, sharePercent: s.sharePercent, suggestedName: s.suggestedName ?? null }))
}

export function toMarkEdits(highlights: ListeningHighlight[]): MarkEdit[] {
  return highlights.map((h) => ({ startMs: h.startMs, tag: h.tag }))
}

/** "1:05:09" or "5:09" from milliseconds. */
export function clockFromMs(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** A voice is shown by the name it was given, or by "Voice 3". A merged voice is shown as the one it was folded into. */
export function voiceName(speakers: SpeakerEdit[], id: string | null): string {
  if (id === null) return 'Unknown voice'
  const byId = new Map(speakers.map((s) => [s.id, s]))
  let current = byId.get(id)
  const seen = new Set<string>()
  while (current?.mergedInto && !seen.has(current.id)) {
    seen.add(current.id)
    current = byId.get(current.mergedInto) ?? current
    if (!current.mergedInto) break
  }
  if (!current) return 'Unknown voice'
  return current.isFacilitator && !current.name.trim() ? 'The facilitator' : current.name.trim() || current.label
}

/** The voices still on the list: those not folded into another. */
export function activeSpeakers(speakers: SpeakerEdit[]): SpeakerEdit[] {
  return speakers.filter((s) => s.mergedInto === null)
}

/**
 * The voices that have a suggested name and no name yet. A name the facilitator typed is never replaced by a suggestion, and a
 * suggestion is only a button: nothing is named until it is pressed.
 */
export function suggestionFor(speaker: SpeakerEdit): string | null {
  const suggested = speaker.suggestedName?.trim() ?? ''
  return suggested !== '' && speaker.name.trim() === '' ? suggested : null
}

/** Takes a voice's suggested name as its name, if it has no name. */
export function acceptSuggestedName(speakers: SpeakerEdit[], id: string): SpeakerEdit[] {
  return speakers.map((s) => (s.id === id && suggestionFor(s) ? { ...s, name: s.suggestedName!.trim() } : s))
}

/** Lines the Portal proposed as worth keeping that are not already marked and have not been set aside, in order, and that exist in the transcript. */
export function openProposals(proposals: number[], marks: MarkEdit[], dismissed: number[], lines: ListeningTranscriptLine[]): ListeningTranscriptLine[] {
  const skip = new Set([...marks.map((m) => m.startMs), ...dismissed])
  const wanted = new Set(proposals.filter((p) => !skip.has(p)))
  return lines.filter((line) => wanted.has(line.startMs))
}

export function renameSpeaker(speakers: SpeakerEdit[], id: string, name: string): SpeakerEdit[] {
  return speakers.map((s) => (s.id === id ? { ...s, name } : s))
}

/** "That's me": at most one voice is the facilitator. Choosing it again takes it back. */
export function markFacilitator(speakers: SpeakerEdit[], id: string): SpeakerEdit[] {
  const already = speakers.find((s) => s.id === id)?.isFacilitator === true
  return speakers.map((s) => ({ ...s, isFacilitator: !already && s.id === id }))
}

/**
 * Two voices that were one person: `from` is folded into `into`. A voice cannot be merged into itself or into a voice that is
 * already folded into it, and whatever was folded into `from` follows it, so there is never a chain a reader has to follow.
 */
export function mergeSpeakers(speakers: SpeakerEdit[], from: string, into: string): SpeakerEdit[] {
  if (from === into) return speakers
  const target = speakers.find((s) => s.id === into)
  const source = speakers.find((s) => s.id === from)
  if (!target || !source || target.mergedInto !== null) return speakers
  return speakers.map((s) => {
    if (s.id === from) return { ...s, mergedInto: into, isFacilitator: false }
    if (s.mergedInto === from) return { ...s, mergedInto: into }
    return s
  })
}

export function unmergeSpeaker(speakers: SpeakerEdit[], id: string): SpeakerEdit[] {
  return speakers.map((s) => (s.id === id ? { ...s, mergedInto: null } : s))
}

export function speakersPayload(speakers: SpeakerEdit[]): { id: string; name: string | null; isFacilitator: boolean; mergedInto: string | null }[] {
  return speakers.map((s) => ({ id: s.id, name: s.name.trim() || null, isFacilitator: s.isFacilitator, mergedInto: s.mergedInto }))
}

/** Marks or unmarks a line. Marking a line that is already marked changes its tag; an unmark removes it. Ordered by where it starts. */
export function markLine(marks: MarkEdit[], startMs: number, tag: string | null): MarkEdit[] {
  const others = marks.filter((m) => m.startMs !== startMs)
  return [...others, { startMs, tag }].sort((a, b) => a.startMs - b.startMs)
}

export function unmarkLine(marks: MarkEdit[], startMs: number): MarkEdit[] {
  return marks.filter((m) => m.startMs !== startMs)
}

export function marksPayload(marks: MarkEdit[]): { startMs: number; tag: string | null }[] {
  return marks.map((m) => ({ startMs: m.startMs, tag: m.tag }))
}

/** The lines in the first `minutes` of the conversation, or all of them. */
export function visibleLines(lines: ListeningTranscriptLine[], minutes: number | null): ListeningTranscriptLine[] {
  if (minutes === null) return lines
  const limit = minutes * 60_000
  return lines.filter((line) => line.startMs < limit)
}

/** The line that starts at `startMs`, for showing the words beside a mark. The words come from the transcript the Portal sent. */
export function lineAt(lines: ListeningTranscriptLine[], startMs: number): ListeningTranscriptLine | undefined {
  return lines.find((line) => line.startMs === startMs)
}

export type AfterStage = 'waiting' | 'working' | 'sent'

/** Whether the page can be worked on. `sent` reads but does not change; `waiting` has no transcript yet. */
export function afterStage(conversation: Pick<ListeningConversation, 'status' | 'transcriptReady'>): AfterStage {
  if (conversation.status === 'sent') return 'sent'
  return conversation.transcriptReady ? 'working' : 'waiting'
}

/** The sentence for where the conversation is before its transcript exists. */
export function waitingSentence(status: ListeningConversation['status']): string {
  switch (status) {
    case 'recording':
      return 'The recording is still open. When the table ends it, the transcript starts.'
    case 'uploading':
      return 'Some of the recording is still reaching WUWF. Keep the table’s page open until it finishes.'
    case 'complete':
    case 'transcribing':
      return 'WUWF has the whole recording and the transcript is being made. This page checks again by itself.'
    default:
      return 'The transcript is not ready yet. This page checks again by itself.'
  }
}

/** The title of the third step, with the count of lines marked. */
export function marksHeading(count: number): string {
  return count === 0 ? 'What mattered' : `What mattered · ${count}`
}
