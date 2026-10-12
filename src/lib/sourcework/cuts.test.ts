import { describe, expect, it } from "vitest";
import {
  computePieceLength,
  cutsWithin,
  parsePieceBody,
  playedMs,
  playedSpans,
  setActualityCuts,
  setActualityTrim,
  type PieceBlock,
} from "./pieces";
import { textForRange, type TextSegment } from "./piece-text";
import { findSilenceCuts, totalCutMs } from "./silences";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EXCERPT = { id: id(900), startMs: 10_000, endMs: 20_000 };
const block = (extra: object = {}): PieceBlock =>
  ({ id: id(1), type: "actuality", excerpt_id: id(900), ...extra }) as PieceBlock;

describe("cuts on an actuality", () => {
  it("parses ascending, separate cuts and refuses anything else", () => {
    const good = [block({ cuts: [{ start_ms: 11_000, end_ms: 12_000 }] })];
    expect(parsePieceBody(good)).toEqual(good);
    const bad = (cuts: unknown) => parsePieceBody([block({ cuts })]);
    expect(bad([{ start_ms: 12_000, end_ms: 11_000 }])).toBeNull();
    expect(
      bad([
        { start_ms: 11_000, end_ms: 13_000 },
        { start_ms: 12_000, end_ms: 14_000 },
      ]),
    ).toBeNull();
    expect(bad([{ start_ms: 1.5, end_ms: 3 }])).toBeNull();
    expect(bad("nope")).toBeNull();
  });

  it("drops an empty list rather than storing it", () => {
    expect(parsePieceBody([block({ cuts: [] })])).toEqual([block()]);
  });

  it("clips cuts to the range and drops slivers", () => {
    const range = { startMs: 12_000, endMs: 18_000 };
    expect(
      cutsWithin(
        [
          { start_ms: 11_000, end_ms: 13_000 },
          { start_ms: 17_950, end_ms: 19_000 },
          { start_ms: 14_000, end_ms: 14_050 },
        ],
        range,
      ),
    ).toEqual([{ start_ms: 12_000, end_ms: 13_000 }]);
  });

  it("plays the range less its cuts", () => {
    const range = { startMs: 10_000, endMs: 20_000 };
    const cuts = [
      { start_ms: 12_000, end_ms: 13_000 },
      { start_ms: 15_000, end_ms: 17_000 },
    ];
    expect(playedSpans(range, cuts)).toEqual([
      { startMs: 10_000, endMs: 12_000 },
      { startMs: 13_000, endMs: 15_000 },
      { startMs: 17_000, endMs: 20_000 },
    ]);
    expect(playedMs(range, cuts)).toBe(7_000);
  });

  it("shortens the piece's length", () => {
    const blocks = [block({ cuts: [{ start_ms: 12_000, end_ms: 15_000 }] })];
    expect(computePieceLength(blocks, [EXCERPT]).actualitySeconds).toBe(7);
  });

  it("keeps cuts through a trim, clipped to the new range, and through resetting the trim", () => {
    const cut = { start_ms: 12_000, end_ms: 14_000 };
    const [trimmed] = setActualityTrim(
      [block({ cuts: [cut] })],
      id(1),
      EXCERPT,
      { inMs: 13_000, outMs: 19_000 },
      null,
    );
    expect(trimmed).toMatchObject({
      in_ms: 13_000,
      out_ms: 19_000,
      cuts: [{ start_ms: 13_000, end_ms: 14_000 }],
    });
    const [reset] = setActualityTrim([trimmed!], id(1), EXCERPT, null, null);
    expect(reset).toEqual(block({ cuts: [{ start_ms: 13_000, end_ms: 14_000 }] }));
  });

  it("sets and clears cuts", () => {
    const cuts = [{ start_ms: 12_000, end_ms: 13_000 }];
    const [withCuts] = setActualityCuts([block()], id(1), EXCERPT, cuts);
    expect(withCuts).toEqual(block({ cuts }));
    expect(setActualityCuts([withCuts!], id(1), EXCERPT, [])[0]).toEqual(block());
  });

  it("leaves out words inside a cut", () => {
    const segment: TextSegment = {
      startMs: 0,
      endMs: 3000,
      text: "one two three",
      words: [
        { w: "one", s: 0, e: 500 },
        { w: "two", s: 1000, e: 1500 },
        { w: "three", s: 2000, e: 2500 },
      ],
    };
    expect(textForRange([segment], 0, 3000, [{ start_ms: 900, end_ms: 1600 }])).toBe("one three");
  });
});

describe("findSilenceCuts", () => {
  const word = (w: string, s: number, e: number) => ({ w, s, e });
  const segment = (words: ReturnType<typeof word>[]): TextSegment => ({
    startMs: words[0]!.s,
    endMs: words[words.length - 1]!.e,
    text: words.map((w) => w.w).join(" "),
    words,
  });
  const setting = { minGapMs: 700, keepMs: 300 };

  it("shortens a long pause to the amount kept, centred in the gap", () => {
    const seg = segment([word("so", 0, 400), word("well", 2400, 2800)]);
    const cuts = findSilenceCuts([seg], { startMs: 0, endMs: 2800 }, setting);
    // a 2000 ms gap, 300 ms left in, 150 either side
    expect(cuts).toEqual([{ start_ms: 550, end_ms: 2250 }]);
    expect(totalCutMs(cuts)).toBe(1700);
  });

  it("ignores gaps under the threshold", () => {
    const seg = segment([word("so", 0, 400), word("well", 900, 1300)]);
    expect(findSilenceCuts([seg], { startMs: 0, endMs: 1300 }, setting)).toEqual([]);
  });

  it("trims leading and trailing silence, keeping half the amount next to the speech", () => {
    const seg = segment([word("hi", 3000, 3400)]);
    const cuts = findSilenceCuts([seg], { startMs: 1000, endMs: 6000 }, setting);
    expect(cuts).toEqual([
      { start_ms: 1000, end_ms: 2850 },
      { start_ms: 3550, end_ms: 6000 },
    ]);
  });

  it("finds nothing on an edited line whose timings were interpolated", () => {
    const seg: TextSegment = { startMs: 0, endMs: 4000, text: "a b c d", words: [] };
    expect(findSilenceCuts([seg], { startMs: 0, endMs: 4000 }, setting)).toEqual([]);
  });

  it("finds nothing with no words in range", () => {
    expect(findSilenceCuts([], { startMs: 0, endMs: 4000 }, setting)).toEqual([]);
  });
});
