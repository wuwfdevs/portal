import type { ListeningProgressAnswer, ListeningQuery, ListeningQuestion } from '@wuwf/portal-contracts'
import {
  deriveSubmitReadiness,
  describeDuration,
  formatStopwatch,
  submitBlockedReason,
  type AnswerProgressState,
  type ParticipantFieldKey,
  type QuestionProgress,
  type SubmitReadiness,
} from '@wuwf/listening-core'

/**
 * The full question set as a sequence of screens (boards 5b and 6-H): intro, microphone, one screen per question, review,
 * a little about you, permissions and consent, sending, received. This module holds the rules the screens share and nothing
 * else (no React, no network), so the parts a participant actually reads are tested directly. The enforcement of every rule
 * (the open window, required answers, caps, consent) is the Portal's; what is here only explains it before the button.
 */
export type Screen = 'intro' | 'mic' | 'question' | 'review' | 'info' | 'consent' | 'submitting' | 'done'

/** What one question holds on this device, mid-flow. `state` is `saved` only once the Portal has the answer. */
export interface LocalAnswer {
  state: AnswerProgressState
  /** How long the saved or taken recording is, in seconds. */
  seconds: number | null
  /** The words of a written answer, once saved. */
  text: string | null
  /** The participant chose to replace a saved answer; the question shows the recorder again. */
  retake: boolean
}

export const EMPTY_ANSWER: LocalAnswer = { state: 'unanswered', seconds: null, text: null, retake: false }

export function answerFor(answers: Record<string, LocalAnswer>, questionId: string): LocalAnswer {
  return answers[questionId] ?? EMPTY_ANSWER
}

/** The Portal's saved answers, as this device should show them when a response is resumed. */
export function answersFromProgress(questions: ListeningQuestion[], saved: ListeningProgressAnswer[]): Record<string, LocalAnswer> {
  const byQuestion = new Map(questions.map((question) => [question.id, question]))
  const out: Record<string, LocalAnswer> = {}
  for (const answer of saved) {
    if (!answer.questionId || !byQuestion.has(answer.questionId)) continue
    if (answer.status !== 'uploaded') continue
    out[answer.questionId] = {
      state: 'saved',
      seconds: answer.durationMs === null ? null : Math.max(1, Math.round(answer.durationMs / 1000)),
      text: answer.kind === 'text' ? answer.text : null,
      retake: false,
    }
  }
  return out
}

export function questionProgress(questions: ListeningQuestion[], answers: Record<string, LocalAnswer>): QuestionProgress[] {
  return questions.map((question) => ({
    questionId: question.id,
    position: question.position,
    required: question.required,
    state: answerFor(answers, question.id).state,
  }))
}

export function readiness(questions: ListeningQuestion[], answers: Record<string, LocalAnswer>): SubmitReadiness {
  return deriveSubmitReadiness(questionProgress(questions, answers))
}

/** "Answered · 0:42", "Skipped", "Required — still needs an answer", "Not answered". */
export function reviewStatus(question: ListeningQuestion, answer: LocalAnswer): string {
  if (answer.state === 'saved') {
    return answer.text !== null ? 'Answered · written' : answer.seconds !== null ? `Answered · ${formatStopwatch(answer.seconds)}` : 'Answered'
  }
  if (answer.state === 'skipped') return 'Skipped'
  return question.required ? 'Required — still needs an answer' : 'Not answered'
}

export interface ReviewRow {
  questionId: string
  position: number
  prompt: string
  status: string
  /** The row's button: replace what is saved, or record it now. */
  action: 'Replace' | 'Record'
}

export function reviewRows(questions: ListeningQuestion[], answers: Record<string, LocalAnswer>): ReviewRow[] {
  return questions.map((question) => {
    const answer = answerFor(answers, question.id)
    return {
      questionId: question.id,
      position: question.position,
      prompt: question.prompt,
      status: reviewStatus(question, answer),
      action: answer.state === 'saved' ? 'Replace' : 'Record',
    }
  })
}

/** The sentence under a blocked Continue on the review screen, or null when nothing blocks it. */
export function reviewBlockedText(questions: ListeningQuestion[], answers: Record<string, LocalAnswer>): string | null {
  const ready = readiness(questions, answers)
  if (ready.canSubmit) return null
  // The consent and field parts of the sentence belong to later screens; here only the answers can block.
  return submitBlockedReason(ready, true, [])
}

/** The progress bar's fill: nothing before the questions, a share while answering, full afterwards. */
export function progressPercent(screen: Screen, questionIndex: number, questionCount: number): number {
  if (screen === 'intro' || screen === 'mic') return 0
  if (screen === 'question') return Math.round(((questionIndex + 1) / Math.max(1, questionCount)) * 100)
  return 100
}

export function stepTitle(screen: Screen, query: Pick<ListeningQuery, 'title'>, questionIndex: number, questionCount: number): string {
  switch (screen) {
    case 'intro':
      return query.title
    case 'mic':
      return 'Get ready to record'
    case 'question':
      return `Question ${questionIndex + 1} of ${questionCount}`
    case 'review':
      return 'Review your answers'
    case 'info':
      return 'A little about you'
    case 'consent':
      return 'Permissions and consent'
    case 'submitting':
      return 'Sending your responses to WUWF'
    case 'done':
      return 'WUWF received your response'
  }
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** "3 questions · one audio answer each" (or "by voice or in writing" where the query allows written answers). */
export function introSummary(query: Pick<ListeningQuery, 'questions' | 'allowTextAnswers'>): string {
  const count = plural(query.questions.length, 'question')
  return query.allowTextAnswers ? `${count} · by voice or in writing` : `${count} · one audio answer each`
}

/** The footer of a question screen: "Question 2 of 3 · 1 answer saved". */
export function questionFooter(questionIndex: number, questionCount: number, savedCount: number): string {
  const base = `Question ${questionIndex + 1} of ${questionCount}`
  return savedCount > 0 ? `${base} · ${plural(savedCount, 'answer')} saved` : base
}

/** The most a person could take: the questions' time limits added up, in whole minutes. An upper bound, never a promise. */
export function maxMinutes(questions: Pick<ListeningQuestion, 'maxDurationSeconds'>[]): number {
  return Math.max(1, Math.ceil(questions.reduce((sum, question) => sum + question.maxDurationSeconds, 0) / 60))
}

/** The line under the page's eyebrow (board 5b): "3 questions · up to 4 minutes · by voice". */
export function pageMeta(query: Pick<ListeningQuery, 'questions' | 'allowTextAnswers'>): string {
  return [plural(query.questions.length, 'question'), `up to ${plural(maxMinutes(query.questions), 'minute')}`, query.allowTextAnswers ? 'by voice or in writing' : 'by voice'].join(' · ')
}

export function limitLabel(question: Pick<ListeningQuestion, 'maxDurationSeconds'>): string {
  return describeDuration(question.maxDurationSeconds)
}

/** The sentence at the end: "2 answers received. Thank you — you can close this page." */
export function doneText(savedCount: number): string {
  return `${plural(savedCount, 'answer')} received. Thank you — you can close this page.`
}

// ----------------------------------------------------------------------------------------------------------------------
// The details and consent screens.

export interface DetailsDraft {
  name: string
  city: string
  email: string
  phone: string
  note: string
}

export const EMPTY_DETAILS: DetailsDraft = { name: '', city: '', email: '', phone: '', note: '' }

export interface ConsentDraft {
  contact: boolean
  identify: boolean
  requestAnonymous: boolean
  agreed: boolean
}

export const EMPTY_CONSENT: ConsentDraft = { contact: false, identify: false, requestAnonymous: false, agreed: false }

/** A blank field is sent as null, never as an empty string. */
export function detailsToWire(details: DetailsDraft): {
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  note: string | null
} {
  const value = (text: string): string | null => (text.trim() === '' ? null : text.trim())
  return { name: value(details.name), email: value(details.email), phone: value(details.phone), city: value(details.city), note: value(details.note) }
}

/**
 * The board warns, and does not block, when someone allows contact without leaving a way to be reached: some people want
 * only to be named. So this is a notice, and the Portal accepts it.
 */
export function contactWithoutWay(details: DetailsDraft, consent: ConsentDraft, query: Pick<ListeningQuery, 'fields'>): boolean {
  if (!consent.contact) return false
  const reachable = (query.fields.email !== 'hidden' && details.email.trim() !== '') || (query.fields.phone !== 'hidden' && details.phone.trim() !== '')
  return !reachable
}

/** Required fields still empty, in the order the form shows them. */
export function missingDetails(query: Pick<ListeningQuery, 'fields'>, details: DetailsDraft): ParticipantFieldKey[] {
  const keys: ParticipantFieldKey[] = ['name', 'city', 'email', 'phone', 'note']
  return keys.filter((key) => query.fields[key] === 'required' && details[key].trim() === '')
}

/** Whether the question set can show the permissions the query asks about, in the order the board lists them. */
export function consentChoices(query: Pick<ListeningQuery, 'askContactPermission' | 'askAttributionPermission' | 'allowAnonymousRequest'>): {
  contact: boolean
  identify: boolean
  anonymous: boolean
} {
  return { contact: query.askContactPermission, identify: query.askAttributionPermission, anonymous: query.allowAnonymousRequest }
}

/** What goes to `save-details` as consent: a choice the query does not ask is never recorded as given. */
export function consentToWire(
  query: Pick<ListeningQuery, 'askContactPermission' | 'askAttributionPermission' | 'allowAnonymousRequest'>,
  consent: ConsentDraft,
): { contact: boolean; identify: boolean; requestAnonymous: boolean } {
  const asks = consentChoices(query)
  return {
    contact: asks.contact && consent.contact,
    identify: asks.identify && consent.identify,
    requestAnonymous: asks.anonymous && consent.requestAnonymous,
  }
}

/** Whether the question set can be started at all, and why not in words. */
export function availabilityMessage(state: ListeningQuery['state'], opensAt: string | null): string | null {
  if (state === 'open') return null
  if (state === 'not_yet_open') {
    return opensAt ? `This question opens ${new Date(opensAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Chicago' })}.` : 'This question has not opened yet.'
  }
  return 'This question is closed and is no longer taking answers.'
}
