import { describe, expect, it } from "vitest";
import {
  LONG_CLIP_SECONDS,
  checkPiece,
  mentionsSpeaker,
  speakerNameTokens,
  type CheckExcerpt,
} from "./piece-checks";
import { newActuality, newNarration, type PieceBlock } from "./pieces";

// The Hurricane Isaias piece as Draft with AI wrote it (v1) and after the assistant moved the
// sheriff's clip to the top (v2): the real shape that exposed these failures.
const CLIPS = {
  powerCounts: "e1",
  legarde: "e2",
  linemen: "e3",
  simmons: "e4",
} as const;

const excerpts: CheckExcerpt[] = [
  { id: CLIPS.powerCounts, startMs: 0, endMs: 41_000, speaker: "Ron DeSantis" },
  { id: CLIPS.legarde, startMs: 0, endMs: 35_000, speaker: "Kaycee Legarde" },
  { id: CLIPS.linemen, startMs: 0, endMs: 46_000, speaker: "Ron DeSantis" },
  { id: CLIPS.simmons, startMs: 0, endMs: 33_000, speaker: "Chip Simmons" },
];

const anchor = newNarration(
  "a",
  "Hurricane Isaias has left much of Northwest Florida without power.",
  "anchor",
);
const desantisLead = newNarration(
  "n1",
  "At a morning briefing, Governor Ron DeSantis put the scale of the outages in numbers.",
);
const legardeLead = newNarration(
  "n2",
  "Escambia County spokeswoman Kaycee Legarde described what residents found.",
);
const simmonsLead = newNarration(
  "n3",
  "Escambia County Sheriff Chip Simmons says generator use has become another danger after the storm.",
);
const closing = newNarration(
  "n4",
  Array.from(
    { length: 12 },
    () => "The picture remained unsettled across the county this week.",
  ).join(" "),
);

const draft: PieceBlock[] = [
  anchor,
  desantisLead,
  newActuality("c1", CLIPS.powerCounts),
  legardeLead,
  newActuality("c2", CLIPS.legarde),
  newNarration("n5", "Crews are working."),
  newNarration("n6", "DeSantis described how road clearing was moving."),
  newActuality("c3", CLIPS.linemen),
  simmonsLead,
  newActuality("c4", CLIPS.simmons),
  closing,
];

const guardrails = {
  targetSeconds: 240,
  toleranceSeconds: 30,
  minActualities: 2,
  maxActualities: 6,
};

function codes(checks: ReturnType<typeof checkPiece>) {
  return checks.map((check) => `${check.code}:${check.blockId ?? ""}`);
}

describe("checkPiece", () => {
  it("says nothing about an empty piece", () => {
    expect(checkPiece([], excerpts, guardrails)).toEqual([]);
  });

  it("flags what is long in the drafted piece, and nothing structural", () => {
    const checks = checkPiece(draft, excerpts, guardrails);
    expect(codes(checks)).toEqual(
      expect.arrayContaining([
        "long_clip:c1",
        "long_clip:c2",
        "long_clip:c3",
        "long_clip:c4",
        "long_narration:n4",
      ]),
    );
    expect(checks.some((check) => check.code === "unintroduced_clip")).toBe(false);
    expect(checks.some((check) => check.code === "orphan_lead_in")).toBe(false);
  });

  it("catches a clip moved away from its lead-in, and the lead-in it left behind", () => {
    // v2: the sheriff's clip right after the anchor intro; his lead-in stays where it was.
    const moved: PieceBlock[] = [
      anchor,
      newActuality("c4", CLIPS.simmons),
      desantisLead,
      newActuality("c1", CLIPS.powerCounts),
      legardeLead,
      newActuality("c2", CLIPS.legarde),
      simmonsLead,
      closing,
    ];
    const checks = checkPiece(moved, excerpts, guardrails);
    const unintroduced = checks.find((check) => check.code === "unintroduced_clip");
    expect(unintroduced).toMatchObject({ blockId: "c4" });
    expect(unintroduced?.message).toContain("Chip Simmons");
    expect(unintroduced?.message).toContain("follows the anchor intro");
    expect(checks.find((check) => check.code === "orphan_lead_in")).toMatchObject({
      blockId: "n3",
    });
  });

  it("does not call a lead-in an orphan when its clip follows it", () => {
    const checks = checkPiece([anchor, simmonsLead, newActuality("c4", CLIPS.simmons)], excerpts, {
      targetSeconds: null,
    });
    expect(checks.filter((check) => check.code !== "long_clip")).toEqual([]);
  });

  it("flags a clip with a lead-in that does not name the speaker", () => {
    const checks = checkPiece(
      [newNarration("n1", "The county has an update."), newActuality("c2", CLIPS.legarde)],
      excerpts,
      { targetSeconds: null },
    );
    expect(checks.find((check) => check.code === "unintroduced_clip")?.message).toContain(
      "doesn't name them",
    );
  });

  it("flags a clip that opens the piece or follows another speaker's clip", () => {
    const opens = checkPiece([newActuality("c2", CLIPS.legarde)], excerpts, {
      targetSeconds: null,
    });
    expect(opens.find((check) => check.code === "unintroduced_clip")?.message).toContain(
      "opens the piece",
    );
    const back = checkPiece(
      [
        newNarration("n1", "Kaycee Legarde of Escambia County."),
        newActuality("c2", CLIPS.legarde),
        newActuality("c4", CLIPS.simmons),
      ],
      excerpts,
      { targetSeconds: null },
    );
    expect(
      back.find((check) => check.code === "unintroduced_clip" && check.blockId === "c4")?.message,
    ).toContain("follows another clip");
  });

  it("lets a second clip from the same voice follow the first", () => {
    const checks = checkPiece(
      [
        newNarration("n1", "Governor Ron DeSantis spoke Friday."),
        newActuality("c1", CLIPS.powerCounts),
        newActuality("c3", CLIPS.linemen),
      ],
      excerpts,
      { targetSeconds: null },
    );
    expect(checks.some((check) => check.code === "unintroduced_clip")).toBe(false);
  });

  it("does not demand a name for a speaker who has none", () => {
    const checks = checkPiece(
      [newNarration("n1", "Someone says."), newActuality("c9", "x")],
      [{ id: "x", startMs: 0, endMs: 5000, speaker: "Speaker B" }],
      { targetSeconds: null },
    );
    expect(checks).toEqual([]);
  });

  it("judges length and actuality count only against the format", () => {
    // The drafted piece runs a little over three and a half minutes: inside 4:00 ± 0:30.
    expect(checkPiece(draft, excerpts, guardrails).some((check) => check.code === "length")).toBe(
      false,
    );
    // Against a two-minute target it is well over; the message counts past the range's edge.
    const over = checkPiece(draft, excerpts, { ...guardrails, targetSeconds: 120 });
    expect(over.find((check) => check.code === "length")?.message).toMatch(/s over the range/);
    // Without a format's tolerance there is no range to judge against.
    expect(
      checkPiece(draft, excerpts, { targetSeconds: 120 }).some((check) => check.code === "length"),
    ).toBe(false);

    const few = checkPiece(
      [newNarration("n1", "Ron DeSantis says so."), newActuality("c1", CLIPS.powerCounts)],
      excerpts,
      { targetSeconds: null, minActualities: 2, maxActualities: 6 },
    );
    expect(few.find((check) => check.code === "actuality_count")?.message).toContain("2 to 6");
  });

  it("leaves a trimmed clip's length to its own range, and lists open [CHECK] placeholders", () => {
    const trimmed = {
      ...newActuality("c1", CLIPS.powerCounts),
      in_ms: 0,
      out_ms: LONG_CLIP_SECONDS * 1000,
    };
    const checks = checkPiece(
      [
        newNarration("n1", "Ron DeSantis says it. [CHECK: the year] And [CHECK: the county]."),
        trimmed,
      ],
      excerpts,
      { targetSeconds: null },
    );
    expect(checks.some((check) => check.code === "long_clip")).toBe(false);
    expect(checks.find((check) => check.code === "unresolved_placeholder")?.message).toContain(
      "2 [CHECK]",
    );
  });

  it("does not hold an anchor intro to the narration length", () => {
    const longAnchor = newNarration(
      "a",
      Array.from({ length: 100 }, () => "word").join(" "),
      "anchor",
    );
    expect(
      checkPiece([longAnchor, newNarration("n", "Short.")], excerpts, { targetSeconds: null }),
    ).toEqual([]);
  });
});

describe("speakerNameTokens and mentionsSpeaker", () => {
  it("uses the words of a name, not a generic label", () => {
    expect(speakerNameTokens("Chip Simmons")).toEqual(["chip", "simmons"]);
    expect(speakerNameTokens("Speaker A")).toEqual([]);
    expect(speakerNameTokens(null)).toEqual([]);
  });

  it("matches whole words, including a possessive", () => {
    const tokens = speakerNameTokens("Ron DeSantis");
    expect(mentionsSpeaker("DeSantis's office said so.", tokens)).toBe(true);
    expect(mentionsSpeaker("Governor Ron spoke.", tokens)).toBe(true);
    expect(mentionsSpeaker("The ronin left.", tokens)).toBe(false);
  });
});
