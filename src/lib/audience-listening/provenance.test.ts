import { describe, expect, it } from "vitest";
import { buildProjectTitle, buildProvenance, type ProvenanceSubmission } from "./provenance";

const QUERY = { id: "query-1", public_title: "Tell us how housing costs are affecting you" };
const ANSWER = { question_position: 2, question_prompt: "What compromises have you made?" };

const IDENTIFIABLE: ProvenanceSubmission = {
  id: "sub-1",
  submitted_at: "2026-08-01T14:00:00Z",
  participant_name: "Maria Lopez",
  participant_city: "Milton",
  participant_note: "Happy to talk further.",
  consent_contact: true,
  consent_identify: true,
  request_anonymous: false,
};

function provenance(submission: ProvenanceSubmission): string {
  return buildProvenance({
    query: QUERY,
    submission,
    answer: ANSWER,
    questionCount: 3,
    siteUrl: "https://tools.wuwf.org",
  });
}

describe("buildProvenance", () => {
  it("carries what a reporter needs to identify the recording in eighteen months", () => {
    const text = provenance(IDENTIFIABLE);
    expect(text).toContain("Tell us how housing costs are affecting you");
    expect(text).toContain("Question 2 of 3: What compromises have you made?");
    expect(text).toContain("Submitted August 1, 2026");
    expect(text).toContain("Participant: Maria Lopez");
    expect(text).toContain("Location: Milton");
    expect(text).toContain("Participant's own note: Happy to talk further.");
  });

  it("links back to the submission it came from", () => {
    expect(provenance(IDENTIFIABLE)).toContain(
      "https://tools.wuwf.org/audience-listening/query-1/submissions/sub-1",
    );
  });

  it("records all three permissions as plain yes/no", () => {
    const text = provenance(IDENTIFIABLE);
    expect(text).toContain("Permission to contact: yes");
    expect(text).toContain("Permission to identify by name: yes");
    expect(text).toContain("Asked to be considered anonymously: no");
  });

  // The two privacy rules. Both matter: the Transcription Workspace is a wider
  // shared workspace than this tool, and its background field is embedded into
  // a search index.
  it("withholds the name when anonymity was requested", () => {
    const text = provenance({ ...IDENTIFIABLE, request_anonymous: true });
    expect(text).not.toContain("Maria Lopez");
    expect(text).toContain("withheld at the participant's request");
  });

  it("withholds the name without attribution permission", () => {
    const text = provenance({ ...IDENTIFIABLE, consent_identify: false });
    expect(text).not.toContain("Maria Lopez");
  });

  it("never carries contact details across, whatever the permissions say", () => {
    const text = provenance({
      ...IDENTIFIABLE,
      participant_note: "Reach me any time.",
    });
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/\d{3}[-.\s]?\d{4}/);
  });

  it("omits absent optional lines rather than printing empty ones", () => {
    const text = provenance({
      ...IDENTIFIABLE,
      participant_city: null,
      participant_note: null,
    });
    expect(text).not.toContain("Location:");
    expect(text).not.toContain("Participant's own note:");
  });

  it("says so plainly when the submission date is missing", () => {
    expect(provenance({ ...IDENTIFIABLE, submitted_at: null })).toContain("date unknown");
  });
});

describe("buildProjectTitle", () => {
  it("names the participant when they may be named", () => {
    expect(buildProjectTitle({ query: QUERY, submission: IDENTIFIABLE, answer: ANSWER })).toBe(
      "Tell us how housing costs are affecting you · Q2 · Maria Lopez",
    );
  });

  it("is anonymous when anonymity was requested", () => {
    expect(
      buildProjectTitle({
        query: QUERY,
        submission: { ...IDENTIFIABLE, request_anonymous: true },
        answer: ANSWER,
      }),
    ).toContain("Anonymous participant");
  });

  it("is anonymous without attribution permission", () => {
    expect(
      buildProjectTitle({
        query: QUERY,
        submission: { ...IDENTIFIABLE, consent_identify: false },
        answer: ANSWER,
      }),
    ).toContain("Anonymous participant");
  });

  it("is anonymous when no name was given", () => {
    expect(
      buildProjectTitle({
        query: QUERY,
        submission: { ...IDENTIFIABLE, participant_name: "   " },
        answer: ANSWER,
      }),
    ).toContain("Anonymous participant");
  });
});
