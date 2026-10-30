// Pure rules for one participant's submission: which information a query asks
// for, what still stands between the participant and a finished submission, and
// how staff should read the result afterwards. No Supabase, no React — the
// public flow and the review screens both derive from these, and the colocated
// tests exercise them directly.

import type { AlAnswerStatus, AlFieldMode } from "@/lib/database.types";

export type ParticipantFieldKey = "name" | "city" | "email" | "phone" | "note";

export interface ParticipantFieldSpec {
  key: ParticipantFieldKey;
  label: string;
  hint: string | null;
  mode: Exclude<AlFieldMode, "hidden">;
  kind: "text" | "email" | "tel" | "textarea";
  maxLength: number;
}

export interface ParticipantFieldConfig {
  name: AlFieldMode;
  city: AlFieldMode;
  email: AlFieldMode;
  phone: AlFieldMode;
  note: AlFieldMode;
}

export type ParticipantValues = Partial<Record<ParticipantFieldKey, string>>;

const FIELD_DEFINITIONS: Record<ParticipantFieldKey, Omit<ParticipantFieldSpec, "mode" | "key">> = {
  name: { label: "Name", hint: null, kind: "text", maxLength: 200 },
  city: { label: "City or community", hint: null, kind: "text", maxLength: 200 },
  email: {
    label: "Email address",
    hint: "Only used if you tell WUWF it's okay to contact you.",
    kind: "email",
    maxLength: 320,
  },
  phone: {
    label: "Phone number",
    hint: "Only used if you tell WUWF it's okay to contact you.",
    kind: "tel",
    maxLength: 40,
  },
  note: {
    label: "Anything else you'd like WUWF to know?",
    hint: null,
    kind: "textarea",
    maxLength: 4000,
  },
};

// Fixed order: who, where, then how to reach you, then free text. Never
// configurable — a reporter choosing which fields to ask for is a real
// decision; choosing what order to ask them in is not.
const FIELD_ORDER: ParticipantFieldKey[] = ["name", "city", "email", "phone", "note"];

/** The fields this query actually shows, in order. Hidden fields are dropped entirely. */
export function participantFields(config: ParticipantFieldConfig): ParticipantFieldSpec[] {
  return FIELD_ORDER.flatMap((key) => {
    const mode = config[key];
    if (mode === "hidden") return [];
    return [{ key, mode, ...FIELD_DEFINITIONS[key] }];
  });
}

/** Required-and-empty fields, in display order. Empty array means good to go. */
export function missingRequiredFields(
  config: ParticipantFieldConfig,
  values: ParticipantValues,
): ParticipantFieldKey[] {
  return participantFields(config)
    .filter((field) => field.mode === "required" && !(values[field.key] ?? "").trim())
    .map((field) => field.key);
}

/**
 * A question's state from the participant's point of view, mid-flow.
 *
 * "saved" is the only one that means the audio has actually reached WUWF —
 * the flow says "Saved" only when this is the state, because a participant who
 * is told their answer is kept and then loses it is the worst outcome this tool
 * can produce.
 */
export type AnswerProgressState =
  | "unanswered"
  | "recorded" // captured locally, not yet uploaded
  | "uploading"
  | "saved"
  | "failed"
  | "skipped";

export interface QuestionProgress {
  questionId: string;
  position: number;
  required: boolean;
  state: AnswerProgressState;
}

export interface SubmitReadiness {
  canSubmit: boolean;
  /** Positions of required questions still without a saved answer. */
  missingRequiredPositions: number[];
  savedCount: number;
}

/**
 * Whether the participant may move on to submitting. Mirrors the checks
 * al_finalize_submission() enforces in the database — this one exists to
 * explain the situation before they press the button, not to be trusted
 * instead of it.
 */
export function deriveSubmitReadiness(progress: QuestionProgress[]): SubmitReadiness {
  const missingRequiredPositions = progress
    .filter((question) => question.required && question.state !== "saved")
    .map((question) => question.position)
    .sort((a, b) => a - b);

  const savedCount = progress.filter((question) => question.state === "saved").length;

  return {
    canSubmit: missingRequiredPositions.length === 0 && savedCount > 0,
    missingRequiredPositions,
    savedCount,
  };
}

/** The sentence shown under a blocked Submit button, or null when nothing blocks it. */
export function submitBlockedReason(
  readiness: SubmitReadiness,
  consentAgreed: boolean,
  missingFields: ParticipantFieldKey[],
): string | null {
  if (readiness.savedCount === 0) {
    return "Record at least one answer before submitting.";
  }
  if (readiness.missingRequiredPositions.length > 0) {
    const positions = readiness.missingRequiredPositions.join(", ");
    return readiness.missingRequiredPositions.length === 1
      ? `Question ${positions} is required and still needs an answer.`
      : `Questions ${positions} are required and still need answers.`;
  }
  if (missingFields.length > 0) {
    const labels = participantFields({
      name: "required",
      city: "required",
      email: "required",
      phone: "required",
      note: "required",
    })
      .filter((field) => missingFields.includes(field.key))
      .map((field) => field.label.replace(/\?$/, ""));
    return `Please fill in: ${labels.join(", ")}.`;
  }
  if (!consentAgreed) {
    return "Please read and accept the terms before submitting.";
  }
  return null;
}

/**
 * How staff should read one question against one submission.
 *
 * "not_asked" matters: a reporter who adds a question after responses have
 * arrived would otherwise see every earlier submission as having skipped it.
 * Comparing the question's creation against the submission date distinguishes
 * "they chose not to answer" from "we never asked them".
 */
export type AnswerOutcome = "answered" | "skipped" | "incomplete" | "not_asked";

export function deriveAnswerOutcome(params: {
  answerStatus: AlAnswerStatus | null;
  questionCreatedAt: string;
  submittedAt: string | null;
}): AnswerOutcome {
  if (params.answerStatus === "uploaded") return "answered";
  if (params.answerStatus === "pending" || params.answerStatus === "failed") return "incomplete";
  if (
    params.submittedAt &&
    new Date(params.questionCreatedAt).getTime() > new Date(params.submittedAt).getTime()
  ) {
    return "not_asked";
  }
  return "skipped";
}

export const ANSWER_OUTCOME_LABEL: Record<AnswerOutcome, string> = {
  answered: "Answered",
  skipped: "Skipped",
  incomplete: "Upload incomplete",
  not_asked: "Not asked",
};

/**
 * Three separate permissions, never collapsed into one "consented" badge. A
 * participant who agrees to be contacted has not agreed to be named, and a
 * participant asking to be considered anonymously has not withdrawn consent to
 * be used at all — a screen that merges them would get an editorial call wrong.
 */
export interface ConsentSummary {
  contact: string;
  attribution: string;
  anonymity: string;
}

export function summarizeConsent(submission: {
  consent_contact: boolean;
  consent_identify: boolean;
  request_anonymous: boolean;
}): ConsentSummary {
  return {
    contact: submission.consent_contact
      ? "May be contacted about their responses"
      : "Did not give permission to be contacted",
    attribution: submission.consent_identify
      ? "May be identified by name"
      : "Did not give permission to be identified by name",
    anonymity: submission.request_anonymous
      ? "Asked to be considered anonymously"
      : "Did not ask to be considered anonymously",
  };
}

/**
 * The name staff see internally: whatever the participant typed. They gave it
 * to WUWF, and the review screen is where it is supposed to be visible — the
 * attribution rules govern what may be published and what crosses into the
 * wider Transcription Workspace, not what the reviewing reporter can read.
 */
export function internalParticipantLabel(submission: {
  participant_name: string | null;
  participant_city: string | null;
}): string {
  return submission.participant_name?.trim() || "No name given";
}

/**
 * The name that may travel with an answer into the Transcription Workspace.
 *
 * Only when they gave permission to be identified AND did not ask to be
 * considered anonymously. The Transcription Workspace is a wider shared
 * workspace than this tool, and its project background is embedded into a
 * search index — a name that crosses that line does not come back.
 */
export function transcriptionParticipantLabel(submission: {
  participant_name: string | null;
  consent_identify: boolean;
  request_anonymous: boolean;
}): string {
  const name = submission.participant_name?.trim();
  if (submission.request_anonymous) return "withheld at the participant's request";
  if (!submission.consent_identify) return "withheld — no permission to identify by name";
  return name || "not given";
}
