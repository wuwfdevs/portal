import { describe, expect, it } from "vitest";
import { participantErrorMessage, type ParticipantErrorCode } from "./participant-errors";

const ALL_CODES: ParticipantErrorCode[] = [
  "unauthenticated",
  "not_accepting",
  "not_open",
  "submission_limit",
  "unsupported_type",
  "unknown_question",
  "invalid_size",
  "too_long",
  "consent_required",
  "no_answers",
  "required_answer_missing",
  "required_field_missing",
  "unavailable",
];

describe("participantErrorMessage", () => {
  it("has a distinct, non-empty message for every code the database can return", () => {
    const messages = ALL_CODES.map(participantErrorMessage);
    expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(ALL_CODES.length);
  });

  it("falls back to the generic message for an unknown or missing code", () => {
    expect(participantErrorMessage(undefined)).toBe(participantErrorMessage("unavailable"));
    expect(participantErrorMessage("something_new_the_database_added")).toBe(
      participantErrorMessage("unavailable"),
    );
  });

  // The specific bug this whole refactor traced back to: a genuine RPC/auth
  // failure (not a business-logic refusal) must read as a real error, not as
  // if the participant did something wrong.
  it("describes an auth/transport failure as ours, not theirs", () => {
    expect(participantErrorMessage("unavailable")).not.toMatch(/you|your/i);
  });
});
