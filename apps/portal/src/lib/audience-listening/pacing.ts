// The Portal's twin of packages/listening-core/src/pacing.ts. The Portal does not depend on that package (the apps share no
// dependencies), so a rule both apps apply is kept in both, with the same tests; change one and change the other.
// How long a table might spend on each question. Pacing belongs to the event (how long it is planned to run), not to a question, so
// nothing here is stored: it is worked out from the planned length and the number of questions, and shown as a suggestion. Nothing
// enforces it; a table moves on at its own pace. Pure, shared by the Portal's Tonight screen and the site's table phone and console.

/** What the standard opening is allowed in a session's clock: each person says a first name, where they live and that they agree. */
export const OPENING_SECONDS = 120;

/** The last call the console gives the room before it ends. */
export const LAST_CALL_SECONDS = 300;

/** No question is suggested less than this, however short the session. */
export const MIN_QUESTION_SECONDS = 60;

/** Suggestions are rounded down to this, so "about 7 minutes 45 seconds" never appears. */
const ROUND_TO_SECONDS = 15;

/** The planned lengths a kitchen table's host chooses from. */
export const KITCHEN_TABLE_MINUTES: readonly number[] = [30, 45, 60];

/** The minutes an event is planned to run: its own setting, or the span between its start and end. */
export function plannedMinutesOf(event: { plannedMinutes: number | null; startsAt: string; endsAt: string }): number {
  if (event.plannedMinutes != null) return event.plannedMinutes;
  const span = (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000;
  return Number.isFinite(span) ? Math.max(1, Math.round(span)) : 1;
}

/**
 * The time to suggest for each question: the planned length, less the opening and the last call, shared equally. Null when there are
 * no questions to share it between. When the session is too short to give every question the minimum, each still gets the minimum:
 * the suggestion never claims a question can be asked in less time than that.
 */
export function suggestedSecondsPerQuestion(input: {
  plannedMinutes: number;
  questionCount: number;
  hasOpening: boolean;
}): number | null {
  if (!Number.isInteger(input.questionCount) || input.questionCount < 1) return null;
  const budget = input.plannedMinutes * 60 - (input.hasOpening ? OPENING_SECONDS : 0) - LAST_CALL_SECONDS;
  const share = Math.floor(budget / input.questionCount / ROUND_TO_SECONDS) * ROUND_TO_SECONDS;
  return Math.max(MIN_QUESTION_SECONDS, share);
}

/** "about 12 minutes", "about 1 minute": a suggestion reads as one, never as a clock. */
export function describeSuggestedSeconds(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
