import { describe, expect, it } from "vitest";
import {
  carryPinned,
  isPassagesOnly,
  newThemeIds,
  parseSynthesisBody,
  sameTheme,
  type EmergingTheme,
  type SynthesisBody,
} from "./synthesis";
import {
  dismissTheme,
  gapQuestionText,
  restoreTheme,
  themeQuestionText,
  trackGap,
  trackTheme,
} from "./synthesis-edit";
import {
  diffLine,
  diffSynthesis,
  previousRunVersion,
  summarizeSynthesis,
} from "./synthesis-summary";
import { buildEvidence, meterDots } from "./synthesis-evidence";

const statement = (
  id: string,
  certainty: "established" | "contested" | "uncertain",
  cites: string[],
) => ({ id, statement: `S ${id}`, certainty, cites, origin: "model" as const });

const theme = (id: string, label: string, cites: string[], extra: Partial<EmergingTheme> = {}) => ({
  id,
  label,
  statement: `About ${label}`,
  cites,
  passages: [],
  origin: "model" as const,
  ...extra,
});

const body = (over: Partial<SynthesisBody> = {}): SynthesisBody => ({
  sections: [],
  tensions: [],
  narrative: [],
  emerging: [],
  ...over,
});

describe("summarizeSynthesis", () => {
  it("counts statements by certainty and leaves dismissed patterns out", () => {
    const summary = summarizeSynthesis(
      body({
        sections: [
          {
            questionId: "q1",
            findings: [
              statement("a", "established", ["1"]),
              statement("b", "established", ["2"]),
              statement("c", "contested", ["3"]),
            ],
            gaps: [{ id: "g", text: "Nobody asked renters.", origin: "model" }],
          },
        ],
        emerging: [
          theme("t1", "Shutters", ["1"]),
          theme("t2", "Parking", ["2"], { status: "dismissed", origin: "person" }),
        ],
      }),
      new Set(["c"]),
    );
    expect(summary).toMatchObject({
      statements: 3,
      byCertainty: { established: 2, contested: 1, uncertain: 0 },
      gaps: 1,
      patterns: 1,
      unsupported: 1,
    });
  });
});

describe("diffSynthesis", () => {
  const section = (...findings: ReturnType<typeof statement>[]) =>
    body({ sections: [{ questionId: "q1", findings, gaps: [] }] });

  it("matches statements by what they cite, not by id or wording", () => {
    const before = section(statement("old", "established", ["1", "2"]));
    const after = section(statement("new", "established", ["1", "2", "3"]));
    expect(diffSynthesis(before, after)).toEqual({ added: 0, removed: 0, recertified: 0 });
  });

  it("counts added, removed and recertified statements", () => {
    const before = section(
      statement("a", "established", ["1"]),
      statement("b", "uncertain", ["2"]),
      statement("c", "contested", ["9"]),
    );
    const after = section(
      statement("a2", "established", ["1"]),
      statement("b2", "contested", ["2"]),
      statement("d", "uncertain", ["7"]),
    );
    const diff = diffSynthesis(before, after);
    expect(diff).toEqual({ added: 1, removed: 1, recertified: 1 });
    expect(diffLine(diff, 3)).toBe(
      "Since version 3: 1 new statement, 1 removed, 1 changed certainty",
    );
  });

  it("says nothing when nothing moved", () => {
    const same = section(statement("a", "established", ["1"]));
    expect(diffLine(diffSynthesis(same, same), 2)).toBeNull();
  });
});

describe("themes across versions", () => {
  it("recognizes the same pattern by label or by shared findings", () => {
    expect(
      sameTheme(
        theme("a", "Neighbors share contractor names", ["1"]),
        theme("b", "neighbors share contractor names.", ["9"]),
      ),
    ).toBe(true);
    expect(
      sameTheme(
        theme("a", "Roofers", ["1", "2", "3"]),
        theme("b", "Contractor word of mouth", ["2", "3"]),
      ),
    ).toBe(true);
    expect(sameTheme(theme("a", "Roofers", ["1"]), theme("b", "Shutters", ["2"]))).toBe(false);
  });

  it("flags themes the previous version lacked", () => {
    const previous = body({ emerging: [theme("a", "Roofers", ["1"])] });
    const current = body({
      emerging: [theme("b", "Roofers", ["1"]), theme("c", "Shutters", ["5"])],
    });
    expect([...newThemeIds(previous, current)]).toEqual(["c"]);
    expect(newThemeIds(null, current).size).toBe(0);
  });

  it("calls a theme passages-only when no accepted finding backs it", () => {
    const passage = { sourceId: "s", startMs: 1, endMs: 2, page: null };
    const base = theme("a", "Shutters", ["gone"], { passages: [passage] });
    expect(isPassagesOnly(base, new Set(["other"]))).toBe(true);
    expect(isPassagesOnly(base, new Set(["gone"]))).toBe(false);
  });

  it("keeps a decided theme across a run and does not offer it again", () => {
    const dismissed = theme("keep", "Parking near the courthouse", ["1"], {
      status: "dismissed",
      origin: "person",
    });
    const tracked = theme("trk", "Renters missing", ["2"], {
      status: "tracking",
      questionId: "q9",
      origin: "person",
    });
    const result = carryPinned(
      body({ emerging: [dismissed, tracked] }),
      body({
        emerging: [
          theme("n1", "parking near the courthouse", ["4"]),
          theme("n2", "Renters missing", ["8"]),
          theme("n3", "Shutters", ["5"]),
        ],
      }),
      new Set(["1", "2", "4", "5", "8"]),
    );
    expect(result.emerging.map((item) => item.id)).toEqual(["keep", "trk", "n3"]);
  });

  it("round-trips status and question ids through the stored body", () => {
    const stored = body({
      sections: [
        {
          questionId: null,
          findings: [],
          gaps: [{ id: "g", text: "No renters yet.", origin: "person", questionId: "q1" }],
        },
      ],
      emerging: [
        theme("t", "Renters", ["1"], { status: "tracking", questionId: "q1", origin: "person" }),
      ],
    });
    expect(parseSynthesisBody(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });
});

describe("a person's edits", () => {
  const start = body({
    sections: [
      {
        questionId: "q1",
        findings: [],
        gaps: [{ id: "g1", text: "No renters yet.", origin: "model" }],
      },
    ],
    emerging: [theme("t1", "Shutters as status", ["1"])],
  });

  it("tracking a theme makes it the person's and records the question", () => {
    const next = trackTheme(start, "t1", "q9")!;
    expect(next.emerging[0]).toMatchObject({
      origin: "person",
      status: "tracking",
      questionId: "q9",
    });
    expect(trackTheme(next, "t1", "q10")).toBeNull();
    expect(trackTheme(start, "missing", "q9")).toBeNull();
  });

  it("dismisses and restores a theme", () => {
    const dismissed = dismissTheme(start, "t1")!;
    expect(dismissed.emerging[0]).toMatchObject({ origin: "person", status: "dismissed" });
    expect(dismissTheme(dismissed, "t1")).toBeNull();
    const restored = restoreTheme(dismissed, "t1")!;
    expect(restored.emerging[0]).toMatchObject({ origin: "model" });
    expect(restored.emerging[0]).not.toHaveProperty("status");
    expect(restoreTheme(start, "t1")).toBeNull();
  });

  it("tracks a gap once", () => {
    const next = trackGap(start, "g1", "q2")!;
    expect(next.sections[0]!.gaps[0]).toMatchObject({ origin: "person", questionId: "q2" });
    expect(trackGap(next, "g1", "q3")).toBeNull();
  });

  it("words the questions and keeps them within the limit", () => {
    expect(themeQuestionText("Shutters as status.")).toBe(
      "What do the sources say about shutters as status?",
    );
    expect(gapQuestionText("No renters yet.")).toBe(
      "What do the sources say about this open point: No renters yet?",
    );
    expect(themeQuestionText("x".repeat(1000)).length).toBeLessThanOrEqual(500);
  });
});

describe("previousRunVersion", () => {
  const versions = [
    { version: 5, savedVia: "person" as const },
    { version: 4, savedVia: "model" as const },
    { version: 3, savedVia: "person" as const },
    { version: 2, savedVia: "model" as const },
    { version: 1, savedVia: "model" as const },
  ];
  it("skips a person's edits and compares run to run", () => {
    expect(previousRunVersion(versions, 5)).toBe(2);
    expect(previousRunVersion(versions, 4)).toBe(2);
    expect(previousRunVersion(versions, 2)).toBe(1);
    expect(previousRunVersion(versions, 1)).toBeNull();
  });
});

describe("buildEvidence", () => {
  const finding = (id: string, sourceId: string, speakerId: string | null) => ({
    id,
    claim: `Claim ${id}`,
    sourceId,
    sourceTitle: `Source ${sourceId}`,
    speakerId,
    speakerLabel: speakerId ? "Marcia T." : null,
    startMs: 42_000,
    endMs: 50_000,
    page: null,
    at: "0:42",
  });
  it("lists only accepted findings, in the order cited, with a link to the passage", () => {
    const byId = new Map(
      [finding("a", "s1", "p1"), finding("b", "s2", null)].map((f) => [f.id, f]),
    );
    const payload = buildEvidence({
      key: "k",
      heading: "H",
      cites: ["b", "gone", "a"],
      projectId: "p",
      findingById: byId,
    });
    expect(payload.items.map((item) => item.id)).toEqual(["b", "a"]);
    expect(payload.items[1]!.who).toBe("Marcia T. · Source s1");
    expect(payload.items[0]!.href).toContain("/sourcework/sources/s2");
    expect(payload.items[0]!.href).toContain("t=42000");
    expect(payload.support).toBe("2 findings · 2 sources · 1 speaker");
  });
  it("fills a dot per source, up to five", () => {
    expect(meterDots(1)).toEqual({ filled: 1, total: 5 });
    expect(meterDots(9)).toEqual({ filled: 5, total: 5 });
  });
});
