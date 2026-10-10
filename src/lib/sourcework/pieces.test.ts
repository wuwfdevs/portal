import { describe, expect, it } from "vitest";
import {
  clampTrim,
  diffAssistantChanges,
  undoAssistantChange,
  computePieceLength,
  describeAgainstTarget,
  insertBlockAt,
  moveBlock,
  moveBlockTo,
  newActuality,
  newNarration,
  parsePieceBody,
  parseTargetInput,
  pieceAsText,
  removeBlock,
  setActualityTrim,
  swapExcerpt,
  type PieceBlock,
} from "./pieces";
import { contextForRange, retrimByToken, textForRange } from "./piece-text";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EXCERPT = { id: id(900), startMs: 10_000, endMs: 19_000 };

describe("parsePieceBody", () => {
  it("accepts narration and actualities, with or without a trim", () => {
    const body = [
      { id: id(1), type: "narration", text: "Hello." },
      { id: id(2), type: "actuality", excerpt_id: id(900) },
      { id: id(3), type: "actuality", excerpt_id: id(900), in_ms: 1000, out_ms: 4000 },
    ];
    expect(parsePieceBody(body)).toEqual(body);
  });
  it("refuses unknown types, bad ids, duplicate ids and half a trim", () => {
    expect(parsePieceBody([{ id: id(1), type: "image" }])).toBeNull();
    expect(parsePieceBody([{ id: "x", type: "narration", text: "" }])).toBeNull();
    expect(
      parsePieceBody([
        { id: id(1), type: "narration", text: "" },
        { id: id(1), type: "narration", text: "" },
      ]),
    ).toBeNull();
    expect(
      parsePieceBody([{ id: id(1), type: "actuality", excerpt_id: id(900), in_ms: 1000 }]),
    ).toBeNull();
    expect(parsePieceBody("nope")).toBeNull();
  });
  it("drops stray fields rather than storing them", () => {
    const parsed = parsePieceBody([{ id: id(1), type: "narration", text: "a", extra: 1 }]);
    expect(parsed).toEqual([{ id: id(1), type: "narration", text: "a" }]);
  });
});

describe("computePieceLength", () => {
  it("adds read time and actuality ranges, and ignores a deleted excerpt", () => {
    const words = Array.from({ length: 16 }, () => "word").join(" "); // 16 words = 6s
    const blocks: PieceBlock[] = [
      newNarration(id(1), words),
      newActuality(id(2), EXCERPT.id),
      { ...newActuality(id(3), EXCERPT.id), in_ms: 10_000, out_ms: 14_000 },
      newActuality(id(4), id(777)),
      newNarration(id(5), ""),
    ];
    const length = computePieceLength(blocks, [EXCERPT]);
    expect(length.narrationSeconds).toBe(6);
    expect(length.actualitySeconds).toBe(13);
    expect(length.totalSeconds).toBe(19);
    expect(length.perBlock.get(id(4))).toBe(0);
  });
});

describe("describeAgainstTarget", () => {
  it("reads under, over and on target", () => {
    expect(describeAgainstTarget(57, 60)).toBe("3s under");
    expect(describeAgainstTarget(72, 60)).toBe("12s over");
    expect(describeAgainstTarget(60, 60)).toBe("on target");
    expect(describeAgainstTarget(10, null)).toBeNull();
    expect(describeAgainstTarget(10, 130)).toBe("2:00 under");
  });
});

describe("parseTargetInput", () => {
  it("takes clock, seconds and minutes forms", () => {
    expect(parseTargetInput("1:00")).toBe(60);
    expect(parseTargetInput("0:45")).toBe(45);
    expect(parseTargetInput("90")).toBe(90);
    expect(parseTargetInput("2m")).toBe(120);
    expect(parseTargetInput("1m30")).toBe(90);
  });
  it("refuses nonsense and out-of-range", () => {
    expect(parseTargetInput("")).toBeNull();
    expect(parseTargetInput("abc")).toBeNull();
    expect(parseTargetInput("0")).toBeNull();
    expect(parseTargetInput("1:75")).toBeNull();
    expect(parseTargetInput("9999")).toBeNull();
  });
});

describe("block edits", () => {
  const base: PieceBlock[] = [
    newNarration(id(1), "a"),
    newNarration(id(2), "b"),
    newNarration(id(3), "c"),
  ];
  it("inserts at the start, middle and end", () => {
    const n = newNarration(id(9));
    expect(insertBlockAt(base, 0, n)[0]).toBe(n);
    expect(insertBlockAt(base, 2, n)[2]).toBe(n);
    expect(insertBlockAt(base, 99, n)[3]).toBe(n);
  });
  it("moves up and down and stops at the ends", () => {
    expect(moveBlock(base, id(2), -1).map((b) => b.id)).toEqual([id(2), id(1), id(3)]);
    expect(moveBlock(base, id(1), -1).map((b) => b.id)).toEqual([id(1), id(2), id(3)]);
    expect(moveBlock(base, id(3), 1).map((b) => b.id)).toEqual([id(1), id(2), id(3)]);
    expect(moveBlockTo(base, id(3), id(1)).map((b) => b.id)).toEqual([id(3), id(1), id(2)]);
  });
  it("removes by id", () => {
    expect(removeBlock(base, id(2)).map((b) => b.id)).toEqual([id(1), id(3)]);
  });
  it("swapping an excerpt drops the old trim", () => {
    const trimmed: PieceBlock[] = [
      { ...newActuality(id(1), id(900)), in_ms: 11_000, out_ms: 15_000 },
    ];
    expect(swapExcerpt(trimmed, id(1), id(901))).toEqual([newActuality(id(1), id(901))]);
  });
  it("a trim equal to the excerpt's own points is stored as none", () => {
    const blocks: PieceBlock[] = [newActuality(id(1), EXCERPT.id)];
    expect(
      setActualityTrim(blocks, id(1), EXCERPT, { inMs: 10_000, outMs: 19_000 }, 60_000),
    ).toEqual(blocks);
    expect(
      setActualityTrim(blocks, id(1), EXCERPT, { inMs: 9_000, outMs: 19_000 }, 60_000)[0],
    ).toMatchObject({ in_ms: 9_000, out_ms: 19_000 });
    const trimmed = setActualityTrim(
      blocks,
      id(1),
      EXCERPT,
      { inMs: 9_000, outMs: 19_000 },
      60_000,
    );
    expect(setActualityTrim(trimmed, id(1), EXCERPT, null, 60_000)).toEqual(blocks);
  });
});

describe("clampTrim", () => {
  it("stays inside the source and keeps a minimum length", () => {
    expect(clampTrim(-500, 2000, 60_000)).toEqual({ inMs: 0, outMs: 2000 });
    expect(clampTrim(59_900, 70_000, 60_000)).toEqual({ inMs: 59_500, outMs: 60_000 });
    expect(clampTrim(5000, 5100, null)).toEqual({ inMs: 5000, outMs: 5500 });
  });
});

describe("piece text", () => {
  const segments = [
    { startMs: 0, endMs: 4000, text: "one two three four", words: [] },
    { startMs: 4000, endMs: 8000, text: "five six seven eight", words: [] },
  ];
  it("derives words from the range by midpoint", () => {
    expect(textForRange(segments, 1000, 5000)).toBe("two three four five");
    expect(textForRange(segments, 20_000, 30_000)).toBe("");
  });
  it("marks the clip's words inside their context", () => {
    const tokens = contextForRange(segments, 2000, 6000, 1);
    expect(tokens.map((t) => t.text)).toEqual(["two", "three", "four", "five", "six", "seven"]);
    expect(tokens.filter((t) => t.inRange).map((t) => t.text)).toEqual([
      "three",
      "four",
      "five",
      "six",
    ]);
  });
  it("tapping an earlier word moves the start, a later word the end", () => {
    const range = { startMs: 2000, endMs: 6000 };
    expect(retrimByToken({ text: "two", startMs: 1000, endMs: 2000 }, range)).toEqual({
      startMs: 1000,
      endMs: 6000,
    });
    expect(retrimByToken({ text: "seven", startMs: 6000, endMs: 7000 }, range)).toEqual({
      startMs: 2000,
      endMs: 7000,
    });
  });
});

describe("pieceAsText", () => {
  it("lays out narration, actualities and total running time", () => {
    const blocks: PieceBlock[] = [
      newNarration(id(1), "Setup line."),
      newActuality(id(2), EXCERPT.id),
    ];
    const length = computePieceLength(blocks, [EXCERPT]);
    const text = pieceAsText(
      "Tunnels",
      blocks,
      () => ({ text: "It was dark.", speaker: "Tom" }),
      length,
    );
    expect(text).toContain("Setup line.");
    expect(text).toContain("[ACTUALITY 0:09 · Tom] “It was dark.”");
    expect(text).toContain("TRT 0:10");
  });
});

describe("assistant changes", () => {
  const n1 = "aaaaaaaa-0000-4000-8000-000000000001";
  const n2 = "aaaaaaaa-0000-4000-8000-000000000002";
  const a1 = "aaaaaaaa-0000-4000-8000-000000000003";
  const ex = "bbbbbbbb-0000-4000-8000-000000000001";

  it("marks blocks the assistant changed or added, not ones it only moved", () => {
    const base = [newNarration(n1, "Old setup."), newActuality(a1, ex)];
    const current = [
      newActuality(a1, ex),
      newNarration(n1, "New setup."),
      newNarration(n2, "Added."),
    ];
    expect(diffAssistantChanges(base, current)).toEqual({
      [n1]: base[0],
      [n2]: null,
    });
  });

  it("undo puts a block back, or takes out one the assistant added", () => {
    const current = [newNarration(n1, "New setup."), newNarration(n2, "Added.")];
    expect(undoAssistantChange(current, n1, newNarration(n1, "Old setup."))[0]).toMatchObject({
      text: "Old setup.",
    });
    expect(undoAssistantChange(current, n2, null)).toHaveLength(1);
  });
});
