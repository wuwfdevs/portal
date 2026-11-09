import type { ListeningErrorCode } from '@wuwf/portal-contracts'

/**
 * The sentence for each refusal the Portal can give. The Portal's codes are the contract; the words are the site's, and
 * every one says what to do or what happened, never that nothing can be done. No code promises a reply.
 */
export const LISTENING_ERROR_MESSAGES: Record<ListeningErrorCode, string> = {
  not_available: 'This question is not available.',
  not_accepting: 'This question is not taking answers right now.',
  not_open: 'This question has not opened yet.',
  submission_limit: "You've already sent as many responses to this question as we can take.",
  unsupported_type: "This browser recorded in a format we can't take. Try writing your answer, or use another browser.",
  unknown_question: 'That question has changed. Reload the page and try again.',
  invalid_size: "That recording is empty or too large to send. Record it again, a little shorter.",
  too_long: 'That recording is longer than this question allows. Record it again, a little shorter.',
  consent_required: 'Please read and accept the terms before sending.',
  no_answers: 'Record or write at least one answer before sending.',
  required_answer_missing: 'A question that needs an answer still has none.',
  required_field_missing: 'A required detail is still missing. Go back and fill it in.',
  not_found: 'We could not find your response. Reload the page and start again.',
  rate_limited: "That's a lot of requests in a short time. Wait a minute and try again.",
  invalid_request: 'Something in that was not right. Reload the page and try again.',
  unavailable: 'Something went wrong on our side. Try again in a moment.',
}

/** Shown when the site is not configured to reach the Portal (a missing origin or secret). Nothing is sent. */
export const LISTENING_NOT_SET_UP = 'Listening is not set up on this server yet.'

export function listeningMessage(code: ListeningErrorCode): string {
  return LISTENING_ERROR_MESSAGES[code]
}
