import { describe, expect, it } from "vitest";
import { parseFormatTrialResults, summarizeTrialSide, trialSide } from "./piece-format-trials";
import { newActuality, newBeat, newNarration } from "./pieces";
import type { FormatSpec } from "./piece-formats";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const spec = {
  targetSeconds: 60,
  minActualities: 1,
  maxActualities: 2,
} as FormatSpec;

const excerpts = new Map([
  [id(900), { title: "Tree", speaker: "Pace", text: "It came down fast." }],
]);

describe("trialSide", () => {
  const side = trialSide({
    label: "Draft",
    spec,
    blocks: [
      newBeat(id(1), "Angle.", { role: "anchor" }),
      newBeat(id(2), "The county's number.", { verify: true }),
      newActuality(id(3), id(900)),
      newNarration(id(4), "Written prose never belongs to an outline."),
    ],
    perBlockSeconds: new Map([[id(3), 12]]),
    excerpts,
    warnings: [],
  });

  it("keeps beats and actualities in order and leaves written narration out", () => {
    expect(side.blocks.map((block) => block.type)).toEqual(["beat", "beat", "actuality"]);
    expect(side.blocks[0]).toMatchObject({ type: "beat", anchor: true, verify: false });
    expect(side.blocks[1]).toMatchObject({ type: "beat", verify: true });
    expect(side.blocks[2]).toMatchObject({ type: "actuality", title: "Tree", speaker: "Pace" });
  });

  it("times only the clips", () => {
    expect(side.clipSeconds).toBe(12);
  });

  it("summarizes beats, actualities and clip time, and whether they fit the format", () => {
    expect(summarizeTrialSide(side)).toEqual({
      line: "2 beats · 1 actuality · 0:12 of clips",
      clipsFit: true,
      withinActualities: true,
    });
    expect(summarizeTrialSide({ ...side, clipSeconds: 90, maxActualities: 0 })).toMatchObject({
      clipsFit: false,
      withinActualities: false,
    });
  });
});

describe("parseFormatTrialResults", () => {
  it("reads a stored trial and refuses anything shaped otherwise", () => {
    const side = trialSide({
      label: "Draft",
      spec,
      blocks: [newBeat(id(1), "Angle.")],
      perBlockSeconds: new Map(),
      excerpts,
      warnings: [],
    });
    expect(parseFormatTrialResults({ kind: "format", live: null, draft: side })?.draft.label).toBe(
      "Draft",
    );
    expect(
      parseFormatTrialResults({ kind: "format", live: null, draft: { label: "x" } }),
    ).toBeNull();
    expect(parseFormatTrialResults(null)).toBeNull();
  });
});
