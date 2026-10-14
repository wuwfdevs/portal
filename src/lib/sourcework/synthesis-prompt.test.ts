import { describe, expect, it } from "vitest";
import {
  buildSynthesisInput,
  buildSynthesisOutputSchema,
  parseSynthesisOutput,
  renderBaseSynthesis,
  type SynthesisParseContext,
} from "./synthesis-prompt";
import type { SynthesisBody } from "./synthesis";
import { MAX_FINDINGS_PER_SECTION, MAX_TENSIONS } from "./synthesis";

let counter = 0;
const context = (overrides: Partial<SynthesisParseContext> = {}): SynthesisParseContext => ({
  findingIds: ["f1", "f2", "f3", "f4"],
  questionIds: ["q1", "q2"],
  passages: new Map([[1, { sourceId: "s1", startMs: 1000, endMs: 9000, page: null }]]),
  newId: () => `id-${++counter}`,
  ...overrides,
});

const answer = (body: Record<string, unknown>) =>
  JSON.stringify({ sections: [], tensions: [], narrative: [], ...body });

const section = (over: Record<string, unknown> = {}) => ({
  question_number: 1,
  findings: [
    {
      statement: "The airport reopened a day after landfall.",
      certainty: "established",
      cites: [1, 2],
    },
  ],
  gaps: [],
  ...over,
});

describe("parseSynthesisOutput: sections", () => {
  it("maps numbers to ids and stamps the model as the author", () => {
    const { body } = parseSynthesisOutput(answer({ sections: [section()] }), context());
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0]!.questionId).toBe("q1");
    expect(body.sections[0]!.findings[0]).toMatchObject({
      cites: ["f1", "f2"],
      certainty: "established",
      origin: "model",
    });
  });

  it("files a section with no question as null, and merges two sections for one question", () => {
    const { body } = parseSynthesisOutput(
      answer({
        sections: [
          section({ question_number: null }),
          section({ findings: [{ statement: "A.", certainty: "uncertain", cites: [3] }] }),
          section({ findings: [{ statement: "B.", certainty: "contested", cites: [4] }] }),
        ],
      }),
      context(),
    );
    expect(body.sections.map((s) => s.questionId)).toEqual([null, "q1"]);
    expect(body.sections[1]!.findings.map((f) => f.statement)).toEqual(["A.", "B."]);
  });

  it("drops a statement that cites nothing the model was shown, with a count", () => {
    const { body, dropped } = parseSynthesisOutput(
      answer({
        sections: [
          section({
            findings: [
              { statement: "No cites.", certainty: "established", cites: [] },
              { statement: "Out of range.", certainty: "established", cites: [0, 9, 2.5] },
              { statement: "Fine.", certainty: "established", cites: [2, 2] },
            ],
          }),
        ],
      }),
      context(),
    );
    expect(body.sections[0]!.findings.map((f) => f.statement)).toEqual(["Fine."]);
    expect(body.sections[0]!.findings[0]!.cites).toEqual(["f2"]);
    expect(dropped.no_valid_cite).toBe(2);
  });

  it("drops an unknown question, a bad certainty, and an empty or oversized statement", () => {
    const { body, dropped } = parseSynthesisOutput(
      answer({
        sections: [
          section({ question_number: 7 }),
          section({
            findings: [
              { statement: "x", certainty: "certain", cites: [1] },
              { statement: "   ", certainty: "established", cites: [1] },
              { statement: "y".repeat(700), certainty: "established", cites: [1] },
              { statement: "ok", certainty: "contested", cites: [1] },
            ],
          }),
        ],
      }),
      context(),
    );
    expect(dropped.unknown_question).toBe(1);
    expect(dropped.bad_certainty).toBe(1);
    expect(dropped.empty_statement).toBe(1);
    expect(dropped.statement_too_long).toBe(1);
    expect(body.sections[0]!.findings.map((f) => f.statement)).toEqual(["ok"]);
  });

  it("keeps a section only if something survived in it, and enforces the ceilings", () => {
    const many = Array.from({ length: MAX_FINDINGS_PER_SECTION + 3 }, (_, index) => ({
      statement: `Statement ${index}`,
      certainty: "uncertain",
      cites: [1],
    }));
    const { body, dropped } = parseSynthesisOutput(
      answer({
        sections: [section({ findings: many }), section({ question_number: 2, findings: [] })],
      }),
      context(),
    );
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0]!.findings).toHaveLength(MAX_FINDINGS_PER_SECTION);
    expect(dropped.over_limit).toBe(3);
  });

  it("keeps gaps, trimmed, and drops blank ones", () => {
    const { body } = parseSynthesisOutput(
      answer({ sections: [section({ gaps: ["  The county's damage figure.  ", " "] })] }),
      context(),
    );
    expect(body.sections[0]!.gaps.map((g) => g.text)).toEqual(["The county's damage figure."]);
  });

  it("treats unreadable output as nothing and counts it", () => {
    expect(parseSynthesisOutput("nope", context()).dropped.unreadable).toBe(1);
    expect(parseSynthesisOutput(JSON.stringify({ x: 1 }), context()).dropped.unreadable).toBe(1);
  });
});

describe("parseSynthesisOutput: tensions and narrative", () => {
  const tension = (over: Record<string, unknown> = {}) => ({
    statement: "The state and the county gave different counts.",
    sides: [
      { label: "State: none confirmed", cites: [1] },
      { label: "County: one death", cites: [2] },
    ],
    ...over,
  });

  it("keeps a tension whose two sides rest on different findings", () => {
    const { body } = parseSynthesisOutput(answer({ tensions: [tension()] }), context());
    expect(body.tensions).toHaveLength(1);
    expect(body.tensions[0]!.sides.map((s) => s.cites)).toEqual([["f1"], ["f2"]]);
  });

  it("drops one-sided tensions, and ones whose sides all rest on the same finding", () => {
    const { body, dropped } = parseSynthesisOutput(
      answer({
        tensions: [
          tension({ sides: [{ label: "Only", cites: [1] }] }),
          tension({
            sides: [
              { label: "A", cites: [1] },
              { label: "B", cites: [1] },
            ],
          }),
          tension({
            sides: [
              { label: "A", cites: [1] },
              { label: "B", cites: [99] },
            ],
          }),
        ],
      }),
      context(),
    );
    expect(body.tensions).toEqual([]);
    expect(dropped.tension_one_sided).toBe(3);
  });

  it("enforces the tension ceiling", () => {
    const { body, dropped } = parseSynthesisOutput(
      answer({ tensions: Array.from({ length: MAX_TENSIONS + 2 }, () => tension()) }),
      context(),
    );
    expect(body.tensions).toHaveLength(MAX_TENSIONS);
    expect(dropped.over_limit).toBe(2);
  });

  it("takes times only from passages the tools returned", () => {
    const { body, dropped } = parseSynthesisOutput(
      answer({
        narrative: [
          { note: "He describes the smell of the mud.", passage_refs: [1, 1] },
          { note: "Invented ref.", passage_refs: [42] },
        ],
      }),
      context(),
    );
    expect(body.narrative).toHaveLength(1);
    expect(body.narrative[0]!.passages).toEqual([
      { sourceId: "s1", startMs: 1000, endMs: 9000, page: null },
    ]);
    expect(dropped.note_no_passage).toBe(1);
  });
});

describe("buildSynthesisInput and renderBaseSynthesis", () => {
  const base = {
    projectTitle: "Hurricane Isaias",
    projectDescription: null,
    questions: [{ number: 1, id: "q1", question: "What happened to power?" }],
    sources: [{ number: 1, id: "s1", title: "Okaloosa update" }],
    findings: [
      {
        number: 1,
        id: "f1",
        sourceNumber: 1,
        questionNumber: 1,
        kind: "factual",
        claim: "Water on the island stayed off.",
        significance: "Shows uneven recovery.",
        speaker: "Sam",
        at: "12:41",
      },
      {
        number: 2,
        id: "f2",
        sourceNumber: 1,
        questionNumber: null,
        kind: "opinion",
        claim: "A resident says it could have been worse.",
        significance: null,
        speaker: null,
        at: null,
      },
    ],
    base: null,
  };

  it("numbers findings and shows their source, speaker and time", () => {
    const text = buildSynthesisInput(base);
    expect(text).toContain("Research questions:\n1. What happened to power?");
    expect(text).toContain(
      "[1] Q1 · factual · Source 1 · Sam · @12:41: Water on the island stayed off. (Why it matters: Shows uneven recovery.)",
    );
    expect(text).toContain("[2] no question · opinion · Source 1: A resident says");
  });

  it("says so when there are no questions", () => {
    expect(buildSynthesisInput({ ...base, questions: [] })).toMatch(/no research question/);
  });

  it("renders the current synthesis with this run's numbers, marks pinned statements, and omits finished-off citations", () => {
    const body: SynthesisBody = {
      sections: [
        {
          questionId: "q1",
          findings: [
            {
              id: "a",
              statement: "Mine.",
              certainty: "contested",
              cites: ["f2", "gone"],
              origin: "person",
            },
            {
              id: "b",
              statement: "Model's.",
              certainty: "established",
              cites: ["f1"],
              origin: "model",
            },
          ],
          gaps: [{ id: "g", text: "A number.", origin: "model" }],
        },
      ],
      tensions: [],
      narrative: [],
      emerging: [],
    };
    const text = renderBaseSynthesis(body, {
      version: 3,
      questionNumberById: new Map([["q1", 1]]),
      findingNumberById: new Map([
        ["f1", 1],
        ["f2", 2],
      ]),
    });
    expect(text).toContain("version 3");
    expect(text).toContain("Question 1:");
    expect(text).toContain("- (pinned) Contested: Mine. [2]");
    expect(text).toContain("- Established: Model's. [1]");
    expect(text).toContain("- Gap: A number.");
  });

  it("renders nothing for an empty synthesis", () => {
    expect(
      renderBaseSynthesis(
        { sections: [], tensions: [], narrative: [], emerging: [] },
        { version: 1, questionNumberById: new Map(), findingNumberById: new Map() },
      ),
    ).toBeNull();
  });
});

describe("buildSynthesisOutputSchema", () => {
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
    check(buildSynthesisOutputSchema());
  });
});

describe("parseSynthesisOutput: emerging themes", () => {
  const theme = (cites: number[]) => ({
    label: "Neighbors helping neighbors",
    statement:
      "Residents describe organizing to help one another instead of waiting for official help.",
    cites,
  });
  const sources = { findingSourceIds: ["s1", "s1", "s2", "s3"] };

  it("keeps a theme resting on findings from two different sources", () => {
    const { body, dropped } = parseSynthesisOutput(
      answer({ emerging: [theme([1, 3])] }),
      context(sources),
    );
    expect(body.emerging).toHaveLength(1);
    expect(body.emerging[0]).toMatchObject({ cites: ["f1", "f3"], origin: "model" });
    expect(dropped.theme_one_source).toBe(0);
  });

  it("drops a theme that rests on a single source, however many findings it cites", () => {
    const { body, dropped } = parseSynthesisOutput(
      answer({ emerging: [theme([1, 2])] }),
      context(sources),
    );
    expect(body.emerging).toEqual([]);
    expect(dropped.theme_one_source).toBe(1);
  });

  it("drops a theme with no citation the model was shown", () => {
    const { body, dropped } = parseSynthesisOutput(
      answer({ emerging: [theme([99])] }),
      context(sources),
    );
    expect(body.emerging).toEqual([]);
    expect(dropped.no_valid_cite).toBe(1);
  });

  it("keeps no more than the ceiling", () => {
    const many = Array.from({ length: 8 }, () => theme([1, 3]));
    const { body, dropped } = parseSynthesisOutput(answer({ emerging: many }), context(sources));
    expect(body.emerging).toHaveLength(5);
    expect(dropped.over_limit).toBe(3);
  });

  it("reads an answer with no emerging field", () => {
    expect(parseSynthesisOutput(answer({}), context(sources)).body.emerging).toEqual([]);
  });
});
