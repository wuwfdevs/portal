// Distinct failure codes the public flow turns into sentences, and the
// sentences themselves. Pulled out of participant.ts as its own dependency-
// free module specifically so it can be imported from client code —
// participant.ts is `server-only` and cannot be.

export type ParticipantErrorCode =
  | "unauthenticated"
  | "not_accepting"
  | "not_open"
  | "submission_limit"
  | "unsupported_type"
  | "unknown_question"
  | "invalid_size"
  | "too_long"
  | "consent_required"
  | "no_answers"
  | "required_answer_missing"
  | "required_field_missing"
  | "unavailable";

const ERROR_MESSAGES: Record<ParticipantErrorCode, string> = {
  unauthenticated: "Your session expired. Reload the page to start again.",
  not_accepting: "This question set isn't accepting responses right now.",
  not_open: "This response has already been submitted, or is no longer open.",
  submission_limit: "You've already responded to this a few times. Thank you!",
  unsupported_type: "Your browser recorded a format we can't accept. Try a different browser.",
  unknown_question: "That question is no longer part of this set. Reload the page.",
  invalid_size: "That recording is too large to accept.",
  too_long: "That recording is longer than this question allows.",
  consent_required: "Please accept the terms before submitting.",
  no_answers: "Record at least one answer before submitting.",
  required_answer_missing: "A required question still needs an answer.",
  required_field_missing: "Please fill in the information marked required.",
  unavailable: "Something went wrong on our side. Please try again.",
};

export function participantErrorMessage(code: string | undefined): string {
  return (
    ERROR_MESSAGES[(code ?? "unavailable") as ParticipantErrorCode] ?? ERROR_MESSAGES.unavailable
  );
}
