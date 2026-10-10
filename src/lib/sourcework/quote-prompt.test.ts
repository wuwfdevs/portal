import { describe, expect, it } from "vitest";
import type { ExtractionUnit } from "./extraction-units";
import {
  buildQuoteInput,
  buildQuoteOutputSchema,
  parseQuoteOutput,
  selectContextUnits,
} from "./quote-prompt";

function unit(
  id: number,
  startMs: number,
  endMs: number,
  text = `Sentence ${id}.`,
): ExtractionUnit {
  return { id, groupIndex: 0, segmentIndex: 0, text, startMs, endMs };
}

// Ten sentences, two seconds each.
const units = Array.from({ length: 10 }, (_, i) => unit(i + 1, i * 2000, i * 2000 + 2000));
const speakers = new Map<number, string | null>(
  units.map((u) => [u.id, u.id <= 8 ? "tom" : "ann"]),
);

describe("selectContextUnits", () => {
  it("shows each passage with a little around it, merged", () => {
    const shown = selectContextUnits(
      units,
      [
        { spans: [{ kind: "temporal", startMs: 6000, endMs: 8000 }] }, // unit 4
      ],
      { before: 1, after: 1 },
    );
    expect(shown.map((u) => u.id)).toEqual([3, 4, 5]);
  });
  it("merges passages that run together and stays inside the source", () => {
    const shown = selectContextUnits(
      units,
      [
        { spans: [{ kind: "temporal", startMs: 0, endMs: 2000 }] }, // unit 1
        { spans: [{ kind: "temporal", startMs: 6000, endMs: 8000 }] }, // unit 4
      ],
      { before: 1, after: 1 },
    );
    expect(shown.map((u) => u.id)).toEqual([1, 2, 3, 4, 5]);
  });
  it("stops at the limit rather than cutting a window in half", () => {
    const shown = selectContextUnits(
      units,
      [{ spans: [{ kind: "temporal", startMs: 0, endMs: 20_000 }] }],
      { before: 0, after: 0, limit: 4 },
    );
    expect(shown.map((u) => u.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("buildQuoteInput", () => {
  it("names each source and its data points, then the numbered sentences", () => {
    const text = buildQuoteInput({
      themeTitle: "Locals treated the tunnels as a playground",
      themeDefinition: "Children explored them.",
      sources: [
        {
          number: 1,
          title: "Tom Reyes, interview",
          units,
          groups: [{ index: 0, label: "0:00 · Tom" }],
          speakerByUnit: speakers,
          points: [
            {
              number: 1,
              claim: "He followed a tunnel.",
              stance: "supports",
              speaker: null,
              spans: [],
            },
          ],
          shown: units.slice(0, 2),
        },
      ],
    });
    expect(text).toContain("=== Source 1: Tom Reyes, interview ===");
    expect(text).toContain("1. [supports] He followed a tunnel.");
    expect(text).toContain("## 0:00 · Tom");
    expect(text).toContain("[1] Sentence 1.");
    expect(text).not.toContain("[3]");
  });
});

describe("buildQuoteOutputSchema", () => {
  it("is strict and asks for sentence numbers, never text", () => {
    const schema = buildQuoteOutputSchema() as {
      properties: { quotes: { items: Record<string, unknown> } };
    };
    const item = schema.properties.quotes.items as {
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(Object.keys(item.properties));
    expect(Object.keys(item.properties)).not.toContain("text");
  });
});

describe("parseQuoteOutput", () => {
  const sources = [{ shown: units, speakerByUnit: speakers, pointNumbers: [1, 2, 3] }];
  const quote = (over: Record<string, unknown> = {}) => ({
    source_number: 1,
    first_sentence: 2,
    last_sentence: 3,
    tier: "strong",
    why: "Two concrete images.",
    point_numbers: [1],
    ...over,
  });
  const parse = (items: unknown[]) => parseQuoteOutput(JSON.stringify({ quotes: items }), sources);

  it("derives the times from the sentences and keeps the data points it rests on", () => {
    const result = parse([quote()]);
    expect(result.quotes).toEqual([
      {
        sourceIndex: 0,
        startMs: 2000,
        endMs: 6000,
        firstUnit: 2,
        lastUnit: 3,
        tier: "strong",
        why: "Two concrete images.",
        pointIndexes: [0],
        speakerId: "tom",
      },
    ]);
  });
  it("drops a clip in a source or sentence it was never shown", () => {
    expect(parse([quote({ source_number: 2 })]).dropped.unknown_source).toBe(1);
    expect(parse([quote({ first_sentence: 40, last_sentence: 41 })]).dropped.unknown_sentence).toBe(
      1,
    );
    expect(parse([quote({ first_sentence: 3, last_sentence: 2 })]).dropped.unknown_sentence).toBe(
      1,
    );
  });
  it("drops a clip that jumps over a gap in what was shown", () => {
    const gappy = [
      {
        shown: [units[0]!, units[1]!, units[4]!, units[5]!],
        speakerByUnit: speakers,
        pointNumbers: [1],
      },
    ];
    const result = parseQuoteOutput(
      JSON.stringify({ quotes: [quote({ first_sentence: 2, last_sentence: 5 })] }),
      gappy,
    );
    expect(result.quotes).toEqual([]);
    expect(result.dropped.unknown_sentence).toBe(1);
  });
  it("drops a clip across two speakers", () => {
    const result = parse([quote({ first_sentence: 8, last_sentence: 9 })]);
    expect(result.dropped.mixed_speakers).toBe(1);
    expect(result.quotes).toEqual([]);
  });
  it("drops a clip that is too short or too long", () => {
    const short = [
      { shown: [unit(1, 0, 800)], speakerByUnit: new Map([[1, "a"]]), pointNumbers: [] },
    ];
    expect(
      parseQuoteOutput(
        JSON.stringify({ quotes: [quote({ first_sentence: 1, last_sentence: 1 })] }),
        short,
      ).dropped.wrong_length,
    ).toBe(1);
    const long = [
      { shown: [unit(1, 0, 70_000)], speakerByUnit: new Map([[1, "a"]]), pointNumbers: [] },
    ];
    expect(
      parseQuoteOutput(
        JSON.stringify({ quotes: [quote({ first_sentence: 1, last_sentence: 1 })] }),
        long,
      ).dropped.wrong_length,
    ).toBe(1);
  });
  it("needs a reason and a real tier", () => {
    expect(parse([quote({ why: "  " })]).dropped.no_reason).toBe(1);
    expect(parse([quote({ tier: "great" })]).dropped.bad_tier).toBe(1);
  });
  it("ignores data point numbers that aren't this source's", () => {
    expect(parse([quote({ point_numbers: [1, 2, 9, 1] })]).quotes[0]!.pointIndexes).toEqual([0, 1]);
  });
  it("keeps the earlier of two clips on the same stretch", () => {
    const result = parse([
      quote({ first_sentence: 2, last_sentence: 3, tier: "good" }),
      quote({ first_sentence: 3, last_sentence: 4, tier: "strong" }),
      quote({ first_sentence: 6, last_sentence: 7, tier: "usable" }),
    ]);
    expect(result.quotes.map((q) => q.firstUnit)).toEqual([2, 6]);
    expect(result.dropped.duplicate).toBe(1);
  });
  it("reads garbage as unreadable", () => {
    expect(parseQuoteOutput("nope", sources).dropped.unreadable).toBe(1);
    expect(parseQuoteOutput(JSON.stringify({ other: 1 }), sources).dropped.unreadable).toBe(1);
  });
});
