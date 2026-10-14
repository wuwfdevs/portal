import { describe, expect, it } from "vitest";
import {
  OUTLINE_FRAMING,
  buildOutlineInput,
  buildOutlineOutputSchema,
  parseOutlineOutput,
  type OutlineParseContext,
} from "./piece-outline-prompt";
import { DRAFT_STANDARDS } from "./piece-draft-prompt";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function context(): OutlineParseContext {
  let n = 1000;
  return {
    findingIds: [id(1), id(2), id(3)],
    excerpts: [
      { number: 1, id: id(901) },
      { number: 2, id: id(902) },
    ],
    passages: new Map([
      [1, { sourceId: id(50), startMs: 4000, endMs: 12_000, page: null }],
      [2, { sourceId: id(50), startMs: null, endMs: null, page: 3 }],
    ]),
    newId: () => id(n++),
  };
}

const beat = (over: Record<string, unknown> = {}) => ({
  kind: "beat",
  text: "Open on the tree.",
  finding_numbers: [1],
  verify: false,
  anchor: false,
  tape_ref: null,
  excerpt_number: null,
  ...over,
});
const clip = (n: number) => ({
  kind: "actuality",
  text: "",
  finding_numbers: [],
  verify: false,
  anchor: false,
  tape_ref: null,
  excerpt_number: n,
});

const parse = (blocks: unknown[]) => parseOutlineOutput(JSON.stringify({ blocks }), context());

describe("OUTLINE_FRAMING", () => {
  it("carries the shared standards and never lets the model name a time", () => {
    expect(OUTLINE_FRAMING).toContain(DRAFT_STANDARDS);
    expect(OUTLINE_FRAMING).toContain("you cannot name a time yourself");
  });
});

describe("buildOutlineOutputSchema", () => {
  it("is strict: every property required, no extras", () => {
    const schema = buildOutlineOutputSchema() as {
      additionalProperties: boolean;
      properties: {
        blocks: {
          items: { additionalProperties: boolean; required: string[]; properties: object };
        };
      };
    };
    const item = schema.properties.blocks.items;
    expect(schema.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
    expect(item.required.sort()).toEqual(Object.keys(item.properties).sort());
  });
});

describe("buildOutlineInput", () => {
  const base = {
    projectTitle: "Isaias",
    projectDescription: null,
    direction: "",
    formatGuide: null,
    targetSeconds: 53,
    questions: [],
    synthesisLines: [],
    findings: [
      {
        number: 1,
        claim: "Power was out for six days.",
        significance: null,
        kind: "firsthand",
        sourceTitle: "Rosado",
        speaker: "Ivan Rosado",
        at: "12:41",
        questionNumber: null,
      },
    ],
    excerpts: [
      {
        number: 1,
        id: id(901),
        title: "Tree",
        speaker: "Ivan Rosado",
        sourceTitle: "Rosado",
        seconds: 14,
        words: "I cut it myself.",
      },
    ],
  };
  it("numbers findings and excerpts, and says what is missing", () => {
    const text = buildOutlineInput(base);
    expect(text).toContain(
      "[1] no question · firsthand · Rosado · Ivan Rosado · @12:41: Power was out",
    );
    expect(text).toContain("Excerpt 1 · 0:14 · Ivan Rosado · Rosado");
    expect(text).toContain("None given.");
    expect(text).toContain("no research question");
    expect(text).toContain("Target length: 0:53.");
  });
  it("cuts a long excerpt for reading only", () => {
    const text = buildOutlineInput({
      ...base,
      excerpts: [{ ...base.excerpts[0]!, words: "w".repeat(2000) }],
    });
    expect(text).toContain("…");
    expect(text.length).toBeLessThan(2500);
  });
  it("adds the synthesis only when there is one", () => {
    expect(buildOutlineInput(base)).not.toContain("establish");
    expect(
      buildOutlineInput({ ...base, synthesisLines: ["Question 1:", "- Established: x [1]"] }),
    ).toContain("- Established: x [1]");
  });
});

describe("parseOutlineOutput", () => {
  it("maps finding numbers and excerpt numbers to ids, in order", () => {
    const result = parse([beat({ finding_numbers: [1, 3] }), clip(2), beat({ text: "Close." })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((block) => block.type)).toEqual(["beat", "actuality", "beat"]);
    expect(result.blocks[0]).toMatchObject({ cites: [id(1), id(3)] });
    expect(result.blocks[1]).toMatchObject({ excerpt_id: id(902) });
  });

  it("drops finding numbers it was never shown and duplicate cites", () => {
    const result = parse([beat({ finding_numbers: [2, 2, 9, 0] })]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.blocks[0]).toMatchObject({ cites: [id(2)] });
    expect(result.dropped.unknown_finding).toBe(2);
  });

  it("fills tape only from a ref a tool returned, and only for a recording range", () => {
    const good = parse([beat({ tape_ref: 1 })]);
    if (!good.ok) throw new Error("expected ok");
    expect(good.blocks[0]).toMatchObject({
      tape: { sourceId: id(50), startMs: 4000, endMs: 12_000 },
    });
    for (const ref of [2, 99]) {
      const bad = parse([beat({ tape_ref: ref })]);
      if (!bad.ok) throw new Error("expected ok");
      expect(bad.blocks[0]).not.toHaveProperty("tape");
      expect(bad.dropped.tape_invalid).toBe(1);
    }
  });

  it("drops unknown and repeated excerpts", () => {
    const result = parse([beat(), clip(1), clip(1), clip(7)]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.blocks).toHaveLength(2);
    expect(result.dropped.duplicate_excerpt).toBe(1);
    expect(result.dropped.unknown_excerpt).toBe(1);
    expect(result.warnings.length).toBe(2);
  });

  it("allows an anchor lead-in only as the first block", () => {
    const first = parse([beat({ anchor: true }), beat({ text: "Next.", anchor: true })]);
    if (!first.ok) throw new Error("expected ok");
    expect(first.blocks[0]).toMatchObject({ role: "anchor" });
    expect(first.blocks[1]).not.toHaveProperty("role");
    expect(first.dropped.anchor_moved).toBe(1);
  });

  it("drops a beat with no words, and fails with no beat at all", () => {
    const result = parse([beat({ text: "   " }), beat({ text: "Real." })]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.blocks).toHaveLength(1);
    expect(result.dropped.empty_beat).toBe(1);
    expect(parse([clip(1)]).ok).toBe(false);
    expect(parse([]).ok).toBe(false);
  });

  it("refuses an answer it cannot read", () => {
    expect(parseOutlineOutput("not json", context()).ok).toBe(false);
    expect(parseOutlineOutput(JSON.stringify({ nope: 1 }), context()).ok).toBe(false);
  });
});
