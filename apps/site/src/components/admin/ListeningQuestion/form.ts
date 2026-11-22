import {
  AUTHORING_DEFAULT_DURATION_SECONDS,
  AUTHORING_MAX_DURATION_SECONDS,
  AUTHORING_MAX_QUESTIONS,
  AUTHORING_MIN_DURATION_SECONDS,
  type ListeningAuthoringQuery,
  type ListeningAuthoringStatus,
} from '@wuwf/portal-contracts'

/**
 * The pure half of the block editor's "Listening query" field: the form's state, what it sends, and the problems it can name before
 * sending. The Portal checks everything again and its sentence wins; this only saves the editor a round trip for the plain mistakes.
 * No React, so it is tested.
 */
export interface QuestionDraft {
  /** A question the Portal already holds in this query; absent for a new one. */
  id?: string
  prompt: string
  guidance: string
  required: boolean
  /** Text while the editor types: turned into a number only on save. */
  seconds: string
}

export interface QueryDraft {
  internalTitle: string
  publicTitle: string
  publicIntro: string
  internalNotes: string
  askedBy: string
  fromLabel: string
  contextLabel: string
  allowTextAnswers: boolean
  /** `datetime-local` text ("2026-12-01T09:00"), in the editor's own time zone; empty for none. */
  opensAt: string
  closesAt: string
  questions: QuestionDraft[]
}

export const blankQuestion = (): QuestionDraft => ({ prompt: '', guidance: '', required: false, seconds: String(AUTHORING_DEFAULT_DURATION_SECONDS) })

export const blankDraft = (): QueryDraft => ({
  internalTitle: '',
  publicTitle: '',
  publicIntro: '',
  internalNotes: '',
  askedBy: '',
  fromLabel: '',
  contextLabel: '',
  allowTextAnswers: true,
  opensAt: '',
  closesAt: '',
  questions: [blankQuestion()],
})

/** An ISO timestamp as `datetime-local` text in the browser's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `datetime-local` text as an ISO timestamp (read in the browser's time zone), or null when empty or not a date. */
export function fromLocalInput(text: string): string | null {
  if (!text.trim()) return null
  const d = new Date(text)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function draftFromQuery(query: ListeningAuthoringQuery): QueryDraft {
  return {
    internalTitle: query.internalTitle,
    publicTitle: query.publicTitle,
    publicIntro: query.publicIntro,
    internalNotes: query.internalNotes ?? '',
    askedBy: query.askedBy ?? '',
    fromLabel: query.fromLabel ?? '',
    contextLabel: query.contextLabel ?? '',
    allowTextAnswers: query.allowTextAnswers,
    opensAt: toLocalInput(query.opensAt),
    closesAt: toLocalInput(query.closesAt),
    questions: query.questions.map((q) => ({ id: q.id, prompt: q.prompt, guidance: q.guidance ?? '', required: q.required, seconds: String(q.maxDurationSeconds) })),
  }
}

/** The body of a save. Empty optional text is sent as null; a time the editor left blank is null. */
export function saveBody(draft: QueryDraft, publicId: string | null): Record<string, unknown> {
  const orNull = (s: string) => (s.trim() === '' ? null : s.trim())
  return {
    ...(publicId ? { publicId } : {}),
    query: {
      internalTitle: draft.internalTitle.trim(),
      publicTitle: draft.publicTitle.trim(),
      publicIntro: draft.publicIntro.trim(),
      internalNotes: orNull(draft.internalNotes),
      askedBy: orNull(draft.askedBy),
      fromLabel: orNull(draft.fromLabel),
      contextLabel: orNull(draft.contextLabel),
      allowTextAnswers: draft.allowTextAnswers,
      opensAt: fromLocalInput(draft.opensAt),
      closesAt: fromLocalInput(draft.closesAt),
    },
    questions: draft.questions.map((q) => ({
      ...(q.id ? { id: q.id } : {}),
      prompt: q.prompt.trim(),
      guidance: orNull(q.guidance),
      required: q.required,
      maxDurationSeconds: Number(q.seconds),
    })),
  }
}

/** The first plain mistake in a draft, as a sentence, or null. */
export function draftProblem(draft: QueryDraft): string | null {
  if (!draft.internalTitle.trim()) return 'Give the query an internal title, for staff in the Portal.'
  if (!draft.publicTitle.trim()) return 'Give the query a public title, the headline people see.'
  const opens = fromLocalInput(draft.opensAt)
  const closes = fromLocalInput(draft.closesAt)
  if (draft.opensAt.trim() && !opens) return 'The opening time is not a date and time.'
  if (draft.closesAt.trim() && !closes) return 'The closing time is not a date and time.'
  if (opens && closes && new Date(closes).getTime() <= new Date(opens).getTime()) return 'The closing time must be after the opening time.'
  if (draft.questions.length > AUTHORING_MAX_QUESTIONS) return `A query can have at most ${AUTHORING_MAX_QUESTIONS} questions.`
  for (const [i, q] of draft.questions.entries()) {
    if (!q.prompt.trim()) return `Question ${i + 1} needs its words.`
    const seconds = Number(q.seconds)
    if (!Number.isInteger(seconds) || seconds < AUTHORING_MIN_DURATION_SECONDS || seconds > AUTHORING_MAX_DURATION_SECONDS) {
      return `Question ${i + 1}: the longest recording must be a whole number of seconds from ${AUTHORING_MIN_DURATION_SECONDS} to ${AUTHORING_MAX_DURATION_SECONDS}.`
    }
  }
  return null
}

export function addQuestion(draft: QueryDraft): QueryDraft {
  return draft.questions.length >= AUTHORING_MAX_QUESTIONS ? draft : { ...draft, questions: [...draft.questions, blankQuestion()] }
}

export function removeQuestion(draft: QueryDraft, index: number): QueryDraft {
  return { ...draft, questions: draft.questions.filter((_, i) => i !== index) }
}

export function moveQuestion(draft: QueryDraft, index: number, direction: -1 | 1): QueryDraft {
  const to = index + direction
  if (to < 0 || to >= draft.questions.length) return draft
  const questions = [...draft.questions]
  const [moved] = questions.splice(index, 1)
  questions.splice(to, 0, moved!)
  return { ...draft, questions }
}

export const STATUS_LABEL: Record<ListeningAuthoringStatus, string> = {
  draft: 'Draft: not shown to anyone',
  open: 'Open: taking answers',
  closed: 'Closed: no longer taking answers',
  archived: 'Archived',
}

/** The status changes worth offering from a status, as button labels. */
export function statusActions(status: ListeningAuthoringStatus): Array<{ to: ListeningAuthoringStatus; label: string }> {
  switch (status) {
    case 'draft':
      return [{ to: 'open', label: 'Open it to the public' }]
    case 'open':
      return [{ to: 'closed', label: 'Close it' }]
    case 'closed':
      return [
        { to: 'open', label: 'Reopen it' },
        { to: 'archived', label: 'Archive it' },
      ]
    case 'archived':
      return [{ to: 'draft', label: 'Make it a draft again' }]
  }
}
