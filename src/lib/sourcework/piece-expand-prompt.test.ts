import { describe, expect, it } from "vitest";
import {
  EXPAND_FRAMING,
  buildExpandInput,
  buildExpandOutputSchema,
  expandBeats,
  numberedBeats,
} from "./piece-expand-prompt";
import { DRAFT_FRAMING, DRAFT_STANDARDS } from "./piece-draft-prompt";
import { MAX_BLOCKS, newActuality, newBeat, newNarration, type PieceBlock } from "./pieces";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = () => {
  let n = 5000;
  return () => id(n++);
};
const answer = (beats: unknown[]) => JSON.stringify({ beats });

const trimmed = { ...newActuality(id(30), id(900)), in_ms: 1000, out_ms: 4000 };
const outline = (): PieceBlock[] => [
  newBeat(id(1), "Angle: the tree.", { role: "anchor" }),
  newBeat(id(2), "Pace.", { verify: true, cites: [id(100)] }),
  trimmed,
  newNarration(id(31), "Already written."),
  newBeat(id(3), "Close."),
];

describe("the shared standards", () => {
  it("are in both the draft and the expansion framing", () => {
    expect(DRAFT_FRAMING).toContain(DRAFT_STANDARDS);
    expect(EXPAND_FRAMING).toContain(DRAFT_STANDARDS);
  });
});

describe("expandBeats", () => {
  it("replaces each beat in place and leaves every other block exactly as it was", () => {
    const result = expandBeats(
      outline(),
      answer([
        { beat_number: 1, paragraphs: ["Anchor line."] },
        { beat_number: 2, paragraphs: ["One.", "Two."] },
        { beat_number: 3, paragraphs: ["End."] },
      ]),
      ids(),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.blocks.map((block) => block.type)).toEqual([
      "narration",
      "narration",
      "narration",
      "actuality",
      "narration",
      "narration",
    ]);
    expect(result.blocks[0]).toMatchObject({ text: "Anchor line.", role: "anchor" });
    expect(result.blocks[1]).not.toHaveProperty("role");
    // The clip, with its trim and id, and the hand-written narration are untouched.
    expect(result.blocks[3]).toEqual(trimmed);
    expect(result.blocks[4]).toMatchObject({ id: id(31), text: "Already written." });
    expect(result.expanded).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it("keeps a beat the model skipped or left blank, and says so", () => {
    const result = expandBeats(
      outline(),
      answer([
        { beat_number: 1, paragraphs: ["Anchor line."] },
        { beat_number: 3, paragraphs: ["   "] },
      ]),
      ids(),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.blocks.filter((block) => block.type === "beat").map((block) => block.id)).toEqual(
      [id(2), id(3)],
    );
    expect(result.skipped).toBe(2);
    expect(result.warnings[0]).toContain("2 beats were not written");
  });

  it("ignores numbers the piece does not have and uses the first answer for a repeat", () => {
    const result = expandBeats(
      [newBeat(id(1), "Only.")],
      answer([
        { beat_number: 1, paragraphs: ["First."] },
        { beat_number: 1, paragraphs: ["Second."] },
        { beat_number: 7, paragraphs: ["Nope."] },
      ]),
      ids(),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ text: "First." });
    expect(result.warnings.join(" ")).toContain("did not exist");
  });

  it("caps paragraphs per beat", () => {
    const result = expandBeats(
      [newBeat(id(1), "Only.")],
      answer([{ beat_number: 1, paragraphs: ["a", "b", "c", "d", "e", "f"] }]),
      ids(),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.blocks).toHaveLength(4);
  });

  it("fails when nothing is written or the answer is unreadable", () => {
    expect(expandBeats(outline(), answer([]), ids()).ok).toBe(false);
    expect(expandBeats(outline(), "nope", ids()).ok).toBe(false);
    expect(expandBeats(outline(), JSON.stringify({ x: 1 }), ids()).ok).toBe(false);
  });

  it("never grows a piece past the block limit", () => {
    const full: PieceBlock[] = [
      ...Array.from({ length: MAX_BLOCKS - 1 }, (_, i) => newNarration(id(100 + i), "x")),
      newBeat(id(1), "Last."),
    ];
    const first = full.slice(0, 1);
    const result = expandBeats(
      [...first, ...full.slice(1)],
      answer([{ beat_number: 1, paragraphs: ["One.", "Two."] }]),
      ids(),
    );
    expect(result.ok).toBe(false);
  });
});

describe("numberedBeats", () => {
  it("is the numbering the model answers by", () => {
    expect(numberedBeats(outline()).map((beat) => beat.id)).toEqual([id(1), id(2), id(3)]);
  });
});

describe("buildExpandInput / schema", () => {
  it("lists the outline in order, with findings, clips and written narration", () => {
    const text = buildExpandInput({
      projectTitle: "Isaias",
      direction: "",
      formatGuide: null,
      targetSeconds: 53,
      items: [
        {
          kind: "beat",
          number: 1,
          text: "Angle.",
          verify: true,
          anchor: false,
          cited: [
            {
              claim: "Six days without power.",
              speaker: "Ivan Rosado",
              sourceTitle: "Rosado",
              at: "12:41",
              withdrawn: false,
            },
            { claim: "x", speaker: null, sourceTitle: "y", at: null, withdrawn: true },
          ],
        },
        {
          kind: "actuality",
          speaker: "Ivan Rosado",
          sourceTitle: "Rosado",
          seconds: 14,
          words: "I cut it.",
          missing: false,
        },
        { kind: "actuality", speaker: null, sourceTitle: "", seconds: 0, words: "", missing: true },
        { kind: "narration", text: "Already.", anchor: false },
      ],
    });
    expect(text).toContain("BEAT 1 (check before stating as settled): Angle.");
    expect(text).toContain("- Six days without power. [Ivan Rosado, Rosado, @12:41]");
    expect(text).toContain("withdrawn: no longer an accepted finding");
    expect(text).toContain("CLIP · 0:14 · Ivan Rosado · Rosado: “I cut it.”");
    expect(text).toContain("the excerpt is no longer available");
    expect(text).toContain("NARRATION already written: Already.");
    expect(text.indexOf("BEAT 1")).toBeLessThan(text.indexOf("NARRATION already"));
  });
  it("has a strict schema", () => {
    const schema = buildExpandOutputSchema() as {
      properties: {
        beats: { items: { additionalProperties: boolean; required: string[]; properties: object } };
      };
    };
    const item = schema.properties.beats.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required.sort()).toEqual(Object.keys(item.properties).sort());
  });
});
