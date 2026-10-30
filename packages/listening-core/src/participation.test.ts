import { describe, expect, it } from "vitest";
import {
  ANSWER_OUTCOME_LABEL,
  deriveAnswerOutcome,
  deriveSubmitReadiness,
  internalParticipantLabel,
  missingRequiredFields,
  participantFields,
  submitBlockedReason,
  summarizeConsent,
  transcriptionParticipantLabel,
  type ParticipantFieldConfig,
  type QuestionProgress,
} from "./participation";

const ALL_OPTIONAL: ParticipantFieldConfig = {
  name: "optional",
  city: "optional",
  email: "optional",
  phone: "optional",
  note: "optional",
};

describe("participantFields", () => {
  it("drops hidden fields entirely", () => {
    const fields = participantFields({ ...ALL_OPTIONAL, phone: "hidden", note: "hidden" });
    expect(fields.map((field) => field.key)).toEqual(["name", "city", "email"]);
  });

  it("keeps a fixed order regardless of configuration", () => {
    expect(participantFields(ALL_OPTIONAL).map((field) => field.key)).toEqual([
      "name",
      "city",
      "email",
      "phone",
      "note",
    ]);
  });

  it("returns nothing when a query asks for nothing", () => {
    expect(
      participantFields({
        name: "hidden",
        city: "hidden",
        email: "hidden",
        phone: "hidden",
        note: "hidden",
      }),
    ).toEqual([]);
  });
});

describe("missingRequiredFields", () => {
  const config: ParticipantFieldConfig = { ...ALL_OPTIONAL, name: "required", city: "required" };

  it("lists required-and-empty fields in display order", () => {
    expect(missingRequiredFields(config, {})).toEqual(["name", "city"]);
  });

  it("treats whitespace as empty", () => {
    expect(missingRequiredFields(config, { name: "   ", city: "Pensacola" })).toEqual(["name"]);
  });

  it("ignores optional fields left blank", () => {
    expect(missingRequiredFields(config, { name: "Maria", city: "Milton" })).toEqual([]);
  });

  it("never asks for a hidden field", () => {
    expect(missingRequiredFields({ ...config, city: "hidden" }, { name: "Maria" })).toEqual([]);
  });
});

function progress(
  entries: [position: number, required: boolean, state: QuestionProgress["state"]][],
): QuestionProgress[] {
  return entries.map(([position, required, state]) => ({
    questionId: `q${position}`,
    position,
    required,
    state,
  }));
}

describe("deriveSubmitReadiness", () => {
  it("blocks while a required question has no saved answer", () => {
    const result = deriveSubmitReadiness(
      progress([
        [1, true, "unanswered"],
        [2, false, "saved"],
      ]),
    );
    expect(result.canSubmit).toBe(false);
    expect(result.missingRequiredPositions).toEqual([1]);
  });

  it("does not count a recording that is only in the browser", () => {
    // "recorded" means captured locally and not yet uploaded — the whole point
    // of the distinction is that it must not read as done.
    const result = deriveSubmitReadiness(progress([[1, true, "recorded"]]));
    expect(result.canSubmit).toBe(false);
    expect(result.savedCount).toBe(0);
  });

  it("blocks an entirely empty submission even with nothing required", () => {
    const result = deriveSubmitReadiness(
      progress([
        [1, false, "skipped"],
        [2, false, "unanswered"],
      ]),
    );
    expect(result.canSubmit).toBe(false);
  });

  it("allows a submission with every required question saved and optionals skipped", () => {
    const result = deriveSubmitReadiness(
      progress([
        [1, true, "saved"],
        [2, false, "skipped"],
        [3, false, "saved"],
      ]),
    );
    expect(result.canSubmit).toBe(true);
    expect(result.savedCount).toBe(2);
  });

  it("reports missing positions in order", () => {
    const result = deriveSubmitReadiness(
      progress([
        [3, true, "unanswered"],
        [1, true, "failed"],
        [2, true, "saved"],
      ]),
    );
    expect(result.missingRequiredPositions).toEqual([1, 3]);
  });
});

describe("submitBlockedReason", () => {
  it("asks for a recording first", () => {
    const readiness = deriveSubmitReadiness(progress([[1, false, "unanswered"]]));
    expect(submitBlockedReason(readiness, true, [])).toContain("at least one answer");
  });

  it("names the single missing required question", () => {
    const readiness = deriveSubmitReadiness(
      progress([
        [1, false, "saved"],
        [2, true, "unanswered"],
      ]),
    );
    expect(submitBlockedReason(readiness, true, [])).toBe(
      "Question 2 is required and still needs an answer.",
    );
  });

  it("pluralizes when several are missing", () => {
    const readiness = deriveSubmitReadiness(
      progress([
        [1, false, "saved"],
        [2, true, "unanswered"],
        [3, true, "unanswered"],
      ]),
    );
    expect(submitBlockedReason(readiness, true, [])).toBe(
      "Questions 2, 3 are required and still need answers.",
    );
  });

  it("asks for required participant information before consent", () => {
    const readiness = deriveSubmitReadiness(progress([[1, true, "saved"]]));
    const reason = submitBlockedReason(readiness, false, ["name"]);
    expect(reason).toContain("Name");
    expect(reason).not.toContain("terms");
  });

  it("finally asks for consent", () => {
    const readiness = deriveSubmitReadiness(progress([[1, true, "saved"]]));
    expect(submitBlockedReason(readiness, false, [])).toContain("accept the terms");
  });

  it("is null once nothing blocks", () => {
    const readiness = deriveSubmitReadiness(progress([[1, true, "saved"]]));
    expect(submitBlockedReason(readiness, true, [])).toBeNull();
  });
});

describe("deriveAnswerOutcome", () => {
  const submittedAt = "2026-08-01T00:00:00Z";

  it("reads an uploaded answer as answered", () => {
    expect(
      deriveAnswerOutcome({
        answerStatus: "uploaded",
        questionCreatedAt: "2026-07-01T00:00:00Z",
        submittedAt,
      }),
    ).toBe("answered");
  });

  it("reads a never-finished upload as incomplete, not skipped", () => {
    expect(
      deriveAnswerOutcome({
        answerStatus: "pending",
        questionCreatedAt: "2026-07-01T00:00:00Z",
        submittedAt,
      }),
    ).toBe("incomplete");
  });

  it("reads a missing answer to a question that existed as skipped", () => {
    expect(
      deriveAnswerOutcome({
        answerStatus: null,
        questionCreatedAt: "2026-07-01T00:00:00Z",
        submittedAt,
      }),
    ).toBe("skipped");
  });

  it("distinguishes a question added after this response arrived", () => {
    // Otherwise every earlier submission would look like it had skipped it.
    expect(
      deriveAnswerOutcome({
        answerStatus: null,
        questionCreatedAt: "2026-08-05T00:00:00Z",
        submittedAt,
      }),
    ).toBe("not_asked");
  });

  it("has a label for every outcome", () => {
    for (const outcome of ["answered", "skipped", "incomplete", "not_asked"] as const) {
      expect(ANSWER_OUTCOME_LABEL[outcome]).toBeTruthy();
    }
  });
});

describe("summarizeConsent", () => {
  it("keeps the three permissions separate and states the negative explicitly", () => {
    const summary = summarizeConsent({
      consent_contact: true,
      consent_identify: false,
      request_anonymous: true,
    });
    expect(summary.contact).toContain("May be contacted");
    expect(summary.attribution).toContain("Did not give permission to be identified");
    expect(summary.anonymity).toContain("Asked to be considered anonymously");
  });
});

describe("transcriptionParticipantLabel", () => {
  // The line that decides whether a real name crosses into a wider, indexed,
  // shared workspace. Both conditions must hold.
  it("carries the name only with permission and no anonymity request", () => {
    expect(
      transcriptionParticipantLabel({
        participant_name: "Maria Lopez",
        consent_identify: true,
        request_anonymous: false,
      }),
    ).toBe("Maria Lopez");
  });

  it("withholds when anonymity was requested, even with attribution permission", () => {
    expect(
      transcriptionParticipantLabel({
        participant_name: "Maria Lopez",
        consent_identify: true,
        request_anonymous: true,
      }),
    ).toBe("withheld at the participant's request");
  });

  it("withholds without attribution permission", () => {
    expect(
      transcriptionParticipantLabel({
        participant_name: "Maria Lopez",
        consent_identify: false,
        request_anonymous: false,
      }),
    ).toContain("no permission to identify");
  });

  it("says so plainly when no name was given at all", () => {
    expect(
      transcriptionParticipantLabel({
        participant_name: null,
        consent_identify: true,
        request_anonymous: false,
      }),
    ).toBe("not given");
  });
});

describe("internalParticipantLabel", () => {
  it("shows staff the name the participant actually typed", () => {
    expect(
      internalParticipantLabel({ participant_name: "Maria Lopez", participant_city: "Milton" }),
    ).toBe("Maria Lopez");
  });

  it("falls back rather than rendering an empty cell", () => {
    expect(internalParticipantLabel({ participant_name: "  ", participant_city: null })).toBe(
      "No name given",
    );
  });
});
