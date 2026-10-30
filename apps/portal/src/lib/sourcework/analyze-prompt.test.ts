import { describe, expect, it } from "vitest";
import {
  MAX_ANALYZE_EXCERPTS,
  buildAnalyzeInput,
  buildAnalyzeOutputSchema,
  mergeAnalyses,
  parseAnalysisOutput,
  type AnalyzeParseContext,
  noteKey,
} from "./analyze-prompt";
import type { ExtractionUnit } from "./extraction-units";

// Ten sentences, two seconds each. Units 1-5 are the interviewer's (speaker "ivy"), 6-10 the subject's ("sam").
function units(count = 10): ExtractionUnit[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    groupIndex: index < 5 ? 0 : 1,
    text: `Sentence ${index + 1}.`,
    startMs: index * 2000,
    endMs: index * 2000 + 2000,
    segmentIndex: index < 5 ? 0 : 1,
  }));
}

function context(overrides: Partial<AnalyzeParseContext> = {}): AnalyzeParseContext {
  const all = units();
  return {
    questionIds: ["q-a", "q-b"],
    validUnitIds: new Set(all.map((unit) => unit.id)),
    unitsById: new Map(all.map((unit) => [unit.id, unit])),
    speakerByUnit: new Map(all.map((unit) => [unit.id, unit.id <= 5 ? "ivy" : "sam"])),
    interviewerSpeakerIds: new Set(),
    seenUrls: null,
    ...overrides,
  };
}

const finding = (over: Record<string, unknown> = {}) => ({
  question_number: 1,
  kind: "firsthand",
  claim: "Sam says the water came up to the porch.",
  significance: "The first firsthand account of the depth.",
  spans: [{ from_unit: 6, to_unit: 7 }],
  ...over,
});

const answer = (body: Record<string, unknown>) =>
  JSON.stringify({ findings: [], excerpts: [], consulted: [], ...body });

describe("parseAnalysisOutput: findings", () => {
  it("keeps a finding with its question, significance and passage", () => {
    const parsed = parseAnalysisOutput(answer({ findings: [finding()] }), context());
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatchObject({
      questionId: "q-a",
      relevance: "question",
      kind: "firsthand",
      ranges: [{ from: 6, to: 7 }],
    });
    expect(parsed.findings[0]!.significance).toMatch(/depth/);
  });

  it("files a finding with no question as general", () => {
    const parsed = parseAnalysisOutput(
      answer({ findings: [finding({ question_number: null })] }),
      context({ questionIds: [] }),
    );
    expect(parsed.findings[0]).toMatchObject({ questionId: null, relevance: "general" });
  });

  it("drops a finding that names a question the project doesn't have", () => {
    const parsed = parseAnalysisOutput(
      answer({ findings: [finding({ question_number: 7 })] }),
      context(),
    );
    expect(parsed.findings).toHaveLength(0);
    expect(parsed.dropped.unknown_question).toBe(1);
  });

  it("requires a reason it matters", () => {
    const parsed = parseAnalysisOutput(
      answer({ findings: [finding({ significance: "  " })] }),
      context(),
    );
    expect(parsed.findings).toHaveLength(0);
    expect(parsed.dropped.no_significance).toBe(1);
  });

  it("drops a range that leaves the window rather than clamping it", () => {
    const parsed = parseAnalysisOutput(
      answer({ findings: [finding({ spans: [{ from_unit: 9, to_unit: 12 }] })] }),
      context(),
    );
    expect(parsed.findings).toHaveLength(0);
    expect(parsed.dropped.no_valid_span).toBe(1);
  });

  it("drops a finding that rests only on the interviewer's lines, and keeps one that rests on the subject's", () => {
    const interviewer = context({ interviewerSpeakerIds: new Set(["ivy"]) });
    const parsed = parseAnalysisOutput(
      answer({
        findings: [
          finding({ spans: [{ from_unit: 2, to_unit: 3 }] }),
          finding({ spans: [{ from_unit: 5, to_unit: 6 }] }),
        ],
      }),
      interviewer,
    );
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.dropped.interviewer).toBe(1);
  });

  it("treats unreadable output as nothing, and counts it", () => {
    expect(parseAnalysisOutput("not json", context()).dropped.unreadable).toBe(1);
    expect(parseAnalysisOutput(JSON.stringify({ nope: [] }), context()).dropped.unreadable).toBe(1);
  });

  it("accepts an empty answer: nothing qualifying is a valid result", () => {
    const parsed = parseAnalysisOutput(answer({}), context());
    expect(parsed).toMatchObject({ findings: [], excerpts: [], consulted: [] });
  });
});

describe("parseAnalysisOutput: excerpts", () => {
  const clip = (over: Record<string, unknown> = {}) => ({
    first_unit: 6,
    last_unit: 8,
    why: "A firsthand image only he can give.",
    finding_number: 1,
    ...over,
  });

  it("derives the times from the units, never from the model", () => {
    const parsed = parseAnalysisOutput(
      answer({ findings: [finding()], excerpts: [clip()] }),
      context(),
    );
    expect(parsed.excerpts).toHaveLength(1);
    expect(parsed.excerpts[0]).toMatchObject({ startMs: 10000, endMs: 16000, speakerId: "sam" });
    expect(parsed.excerpts[0]!.serves).toBe(parsed.findings[0]);
  });

  it("serves nothing when the model says narrative, or names a finding that was dropped", () => {
    const parsed = parseAnalysisOutput(
      answer({
        findings: [finding({ significance: "" })],
        excerpts: [
          clip({ finding_number: null }),
          clip({ first_unit: 9, last_unit: 10, finding_number: 1 }),
        ],
      }),
      context(),
    );
    expect(parsed.excerpts.map((excerpt) => excerpt.serves)).toEqual([null, null]);
  });

  it("refuses a clip that crosses speakers", () => {
    const parsed = parseAnalysisOutput(
      answer({ excerpts: [clip({ first_unit: 4, last_unit: 7 })] }),
      context(),
    );
    expect(parsed.excerpts).toHaveLength(0);
    expect(parsed.dropped.clip_mixed_speakers).toBe(1);
  });

  it("accepts a short clip but refuses one longer than a quote can be", () => {
    expect(
      parseAnalysisOutput(answer({ excerpts: [clip({ first_unit: 6, last_unit: 6 })] }), context())
        .excerpts,
    ).toHaveLength(1);

    const long = units().map((unit) => ({
      ...unit,
      startMs: unit.id * 30_000,
      endMs: unit.id * 30_000 + 30_000,
    }));
    const parsed = parseAnalysisOutput(
      answer({ excerpts: [clip({ first_unit: 6, last_unit: 8 })] }),
      context({ unitsById: new Map(long.map((unit) => [unit.id, unit])) }),
    );
    expect(parsed.excerpts).toHaveLength(0);
    expect(parsed.dropped.clip_wrong_length).toBe(1);
  });

  it("refuses a clip that is too short", () => {
    const short = units().map((unit) => ({ ...unit, endMs: unit.startMs! + 800 }));
    const parsed = parseAnalysisOutput(
      answer({ excerpts: [clip({ first_unit: 6, last_unit: 6 })] }),
      context({ unitsById: new Map(short.map((unit) => [unit.id, unit])) }),
    );
    expect(parsed.dropped.clip_wrong_length).toBe(1);
  });

  it("refuses a clip across a gap, a clip with no times (a document), and one with no reason", () => {
    const gap = context({ validUnitIds: new Set([6, 8, 9, 10]) });
    expect(parseAnalysisOutput(answer({ excerpts: [clip()] }), gap).dropped.clip_unknown_unit).toBe(
      1,
    );

    const document = units().map(({ startMs, endMs, ...rest }) => {
      void startMs;
      void endMs;
      return rest;
    });
    const noTimes = parseAnalysisOutput(
      answer({ excerpts: [clip()] }),
      context({ unitsById: new Map(document.map((unit) => [unit.id, unit])) }),
    );
    expect(noTimes.dropped.clip_no_time).toBe(1);

    expect(
      parseAnalysisOutput(answer({ excerpts: [clip({ why: " " })] }), context()).dropped
        .clip_no_reason,
    ).toBe(1);
  });

  it("skips the interviewer's questions as clips", () => {
    const parsed = parseAnalysisOutput(
      answer({ excerpts: [clip({ first_unit: 1, last_unit: 3 })] }),
      context({ interviewerSpeakerIds: new Set(["ivy"]) }),
    );
    expect(parsed.excerpts).toHaveLength(0);
    expect(parsed.dropped.interviewer).toBe(1);
  });

  it("drops a clip that sits on one already chosen, and enforces the ceiling", () => {
    const duplicate = parseAnalysisOutput(
      answer({ excerpts: [clip(), clip({ first_unit: 6, last_unit: 7 })] }),
      context(),
    );
    expect(duplicate.excerpts).toHaveLength(1);
    expect(duplicate.dropped.clip_duplicate).toBe(1);

    const many = Array.from({ length: 14 }, (_, index) => ({
      first_unit: index + 1,
      last_unit: index + 1,
      why: "x",
      finding_number: null,
    }));
    const long = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1,
      groupIndex: 0,
      text: `S${index + 1}`,
      startMs: index * 5000,
      endMs: index * 5000 + 4000,
      segmentIndex: 0,
    }));
    const capped = parseAnalysisOutput(
      answer({ excerpts: many }),
      context({
        validUnitIds: new Set(long.map((unit) => unit.id)),
        unitsById: new Map(long.map((unit) => [unit.id, unit])),
        speakerByUnit: new Map(long.map((unit) => [unit.id, "sam"])),
      }),
    );
    expect(capped.excerpts).toHaveLength(MAX_ANALYZE_EXCERPTS);
    expect(capped.dropped.clip_over_limit).toBe(14 - MAX_ANALYZE_EXCERPTS);
  });
});

describe("parseAnalysisOutput: consulted pages", () => {
  const page = (over: Record<string, unknown> = {}) => ({
    title: "Advanced Redoubt",
    summary: "The Park Service describes brick corridors and a countermining gallery.",
    url: "https://www.nps.gov/guis/learn/historyculture/advanced-redoubt.htm",
    finding_numbers: [1],
    ...over,
  });

  it("keeps a page the search tool returned and links it to the findings it informed", () => {
    const parsed = parseAnalysisOutput(
      answer({ findings: [finding()], consulted: [page()] }),
      context({ seenUrls: new Set([page().url]) }),
    );
    expect(parsed.consulted).toHaveLength(1);
    expect(parsed.consulted[0]).toMatchObject({ sourceName: expect.any(String) });
    expect(parsed.consulted[0]!.informs).toEqual([parsed.findings[0]]);
  });

  it("drops an address the search never returned, but trusts well-formed ones when none were exposed", () => {
    const invented = parseAnalysisOutput(
      answer({ consulted: [page()] }),
      context({ seenUrls: new Set(["https://example.org/other"]) }),
    );
    expect(invented.consulted).toHaveLength(0);
    expect(invented.dropped.note_unusable).toBe(1);

    expect(
      parseAnalysisOutput(answer({ consulted: [page()] }), context({ seenUrls: new Set() }))
        .consulted,
    ).toHaveLength(1);
    expect(
      parseAnalysisOutput(answer({ consulted: [page({ url: "ftp://x" })] }), context()).consulted,
    ).toHaveLength(0);
  });
});

describe("mergeAnalyses", () => {
  it("keeps the earlier window's finding and re-points what referred to the later copy", () => {
    const first = parseAnalysisOutput(answer({ findings: [finding()] }), context());
    const second = parseAnalysisOutput(
      answer({
        findings: [finding({ spans: [{ from_unit: 6, to_unit: 7 }] })],
        excerpts: [{ first_unit: 6, last_unit: 8, why: "Vivid.", finding_number: 1 }],
        consulted: [
          {
            title: "Page",
            summary: "A page.",
            url: "https://example.org/a",
            finding_numbers: [1],
          },
        ],
      }),
      context(),
    );
    const merged = mergeAnalyses([first, second]);
    expect(merged.findings).toHaveLength(1);
    expect(merged.duplicateFindings).toBe(1);
    expect(merged.excerpts[0]!.serves).toBe(merged.findings[0]);
    expect(merged.consulted[0]!.informs).toEqual([merged.findings[0]]);
  });

  it("applies the clip ceiling to the whole source and merges a page cited by two windows", () => {
    const page = {
      title: "P",
      summary: "S",
      url: "https://example.org/p",
      finding_numbers: [] as number[],
    };
    const makeWindow = (offset: number) => {
      const perWindow = MAX_ANALYZE_EXCERPTS;
      const all = Array.from({ length: perWindow }, (_, index) => ({
        id: offset + index + 1,
        groupIndex: 0,
        text: "x",
        startMs: (offset + index) * 6000,
        endMs: (offset + index) * 6000 + 4000,
        segmentIndex: 0,
      }));
      return parseAnalysisOutput(
        answer({
          excerpts: all.map((unit) => ({
            first_unit: unit.id,
            last_unit: unit.id,
            why: "w",
            finding_number: null,
          })),
          consulted: [page],
        }),
        context({
          validUnitIds: new Set(all.map((unit) => unit.id)),
          unitsById: new Map(all.map((unit) => [unit.id, unit])),
          speakerByUnit: new Map(all.map((unit) => [unit.id, "sam"])),
        }),
      );
    };
    const merged = mergeAnalyses([makeWindow(0), makeWindow(MAX_ANALYZE_EXCERPTS)]);
    expect(merged.excerpts).toHaveLength(MAX_ANALYZE_EXCERPTS);
    expect(merged.dropped.clip_over_limit).toBeGreaterThan(0);
    expect(merged.consulted).toHaveLength(1);
  });
});

describe("buildAnalyzeInput", () => {
  const base = {
    projectTitle: "Tunnel Visions",
    projectDescription: null,
    sourceTitle: "Interview with James Teal",
    sourceKindLabel: "Recording",
    units: units(2),
    groups: [
      { index: 0, label: "0:00 · Strickland (interviewer)" },
      { index: 1, label: "0:04 · Teal" },
    ],
    windowLabel: null,
  };

  it("says so when there is no question, instead of leaving the model to guess", () => {
    const text = buildAnalyzeInput({ ...base, questions: [], established: [], notes: [] });
    expect(text).toMatch(/no research question yet/);
    expect(text).not.toMatch(/Research questions:/);
  });

  it("shows what is already established, labelled by question", () => {
    const text = buildAnalyzeInput({
      ...base,
      questions: [{ number: 1, question: "Where were the tunnels?" }],
      established: [
        {
          questionLabel: "Q1",
          claim: "Teal ran through the Redoubt passage.",
          sourceTitle: "Teal",
        },
      ],
      notes: [],
    });
    expect(text).toMatch(/Research questions:\n1\. Where were the tunnels\?/);
    expect(text).toMatch(
      /Already established[^\n]*\n- Q1: Teal ran through the Redoubt passage\. \[Teal\]/,
    );
  });
});

describe("buildAnalyzeInput: background", () => {
  it("shows earlier background as unverified reference, and omits the section when there is none", () => {
    const base = {
      projectTitle: "Tunnel Visions",
      projectDescription: null,
      questions: [],
      established: [],
      sourceTitle: "Teal",
      sourceKindLabel: "Recording",
      units: units(1),
      groups: [{ index: 0, label: "0:00 · Teal" }],
      windowLabel: null,
    };
    const withNotes = buildAnalyzeInput({
      ...base,
      notes: [{ title: "Fort Redoubt terminology", summary: "Usually the Advanced Redoubt." }],
    });
    expect(withNotes).toMatch(
      /Unverified reference[^\n]*never evidence:\n- Fort Redoubt terminology: Usually/,
    );
    expect(buildAnalyzeInput({ ...base, notes: [] })).not.toMatch(/Background from the web/);
  });
});

describe("buildAnalyzeOutputSchema", () => {
  it("is strict: every property of every object is required", () => {
    function check(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;
      if (schema.type === "object") {
        const properties = Object.keys((schema.properties ?? {}) as object);
        expect([...((schema.required ?? []) as string[])].sort()).toEqual(properties.sort());
        expect(schema.additionalProperties).toBe(false);
      }
      for (const value of Object.values(schema)) check(value);
    }
    check(buildAnalyzeOutputSchema());
  });
});

describe("noteKey", () => {
  it("makes two spellings of one subject the same key", () => {
    expect(noteKey("Fort  Barrancas!")).toBe("fort barrancas");
  });
});
