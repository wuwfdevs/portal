import { describe, expect, it } from "vitest";
import {
  buildExtractionInput,
  buildExtractionOutputSchema,
  parseExtractionOutput,
  sumDropped,
} from "./extraction-prompt";

const context = { questionIds: ["qa", "qb"], validUnitIds: new Set([1, 2, 3, 4, 5]) };

function raw(points: unknown[]) {
  return JSON.stringify({ data_points: points });
}

const good = {
  relevance: "question",
  question_number: 2,
  story_element: null,
  kind: "firsthand",
  claim: "  He went into the tunnel   as a child. ",
  spans: [{ from_unit: 2, to_unit: 3 }],
};

describe("parseExtractionOutput", () => {
  it("reads a question point and maps its number to the question id", () => {
    const { points, dropped } = parseExtractionOutput(raw([good]), context);
    expect(dropped.unknown_question).toBe(0);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      relevance: "question",
      questionId: "qb",
      questionKey: "qb",
      storyElement: null,
      kind: "firsthand",
      claim: "He went into the tunnel as a child.",
      ranges: [{ from: 2, to: 3 }],
    });
    expect([...points[0]!.unitIds]).toEqual([2, 3]);
  });

  it("reads a story point and ignores a stray question number", () => {
    const { points } = parseExtractionOutput(
      raw([{ ...good, relevance: "story", question_number: 1, story_element: "place" }]),
      context,
    );
    expect(points[0]).toMatchObject({
      relevance: "story",
      questionId: null,
      storyElement: "place",
    });
  });

  it("drops what it can't trust, and counts why", () => {
    const { points, dropped } = parseExtractionOutput(
      raw([
        { ...good, question_number: 9 },
        { ...good, relevance: "story", story_element: null },
        { ...good, claim: "   " },
        { ...good, claim: "x".repeat(801) },
        { ...good, spans: [{ from_unit: 4, to_unit: 9 }] },
        { ...good, spans: [] },
        { ...good, kind: "rumour" },
        null,
      ]),
      context,
    );
    expect(points).toHaveLength(0);
    expect(dropped).toMatchObject({
      unknown_question: 1,
      bad_relevance: 1,
      empty_claim: 1,
      claim_too_long: 1,
      no_valid_span: 2,
      unreadable: 2,
    });
  });

  it("swaps a reversed range, merges touching ones, and refuses a range that is a chapter", () => {
    const wide = {
      validUnitIds: new Set(Array.from({ length: 40 }, (_, i) => i + 1)),
      questionIds: ["qa"],
    };
    const { points } = parseExtractionOutput(
      raw([
        {
          ...good,
          question_number: 1,
          spans: [
            { from_unit: 3, to_unit: 2 },
            { from_unit: 4, to_unit: 4 },
          ],
        },
        { ...good, question_number: 1, spans: [{ from_unit: 1, to_unit: 30 }] },
      ]),
      wide,
    );
    expect(points).toHaveLength(1);
    expect(points[0]!.ranges).toEqual([{ from: 2, to: 4 }]);
  });

  it("treats unparseable output as one unreadable answer", () => {
    expect(parseExtractionOutput("nope", context).dropped.unreadable).toBe(1);
    expect(parseExtractionOutput("{}", context).dropped.unreadable).toBe(1);
  });
});

describe("sumDropped", () => {
  it("adds counts per reason", () => {
    const a = parseExtractionOutput("x", context).dropped;
    const b = parseExtractionOutput("y", context).dropped;
    expect(sumDropped(a, b).unreadable).toBe(2);
  });
});

describe("schema and input", () => {
  it("lists every property as required, which strict mode demands", () => {
    const schema = buildExtractionOutputSchema() as {
      properties: {
        data_points: { items: { required: string[]; properties: Record<string, unknown> } };
      };
    };
    const item = schema.properties.data_points.items;
    expect(item.required.sort()).toEqual(Object.keys(item.properties).sort());
  });

  it("numbers questions, labels notes unverified, and names the window", () => {
    const text = buildExtractionInput({
      projectTitle: "Fort",
      projectDescription: "Memories.",
      questions: [{ number: 1, question: "What was it like?" }],
      notes: [{ title: "Fort Barrancas", summary: "A fort." }],
      sourceTitle: "Tom Reyes",
      sourceKindLabel: "Audio",
      units: [{ id: 1, groupIndex: 0, text: "Hello." }],
      groups: [{ index: 0, label: "0:00 · Tom" }],
      windowLabel: "Part 1 of 2",
    });
    expect(text).toContain("1. What was it like?");
    expect(text).toContain("unverified web reference");
    expect(text).toContain("Source: Tom Reyes (Audio) — Part 1 of 2");
    expect(text).toContain("## 0:00 · Tom\n[1] Hello.");
  });
});
