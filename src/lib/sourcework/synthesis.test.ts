import { describe, expect, it } from "vitest";
import {
  carryPinned,
  citedFindingIds,
  emptySynthesis,
  findingsChangedSince,
  isEmptySynthesis,
  parseSynthesisBody,
  supportBreadth,
  unsupportedIds,
  type SynthesisBody,
} from "./synthesis";

const finding = (id: string, origin: "model" | "person", cites: string[], extra = {}) => ({
  id,
  statement: `Statement ${id}`,
  certainty: "established" as const,
  cites,
  origin,
  ...extra,
});

describe("parseSynthesisBody", () => {
  it("reads a well-formed body", () => {
    const body: SynthesisBody = {
      sections: [{ questionId: "q1", findings: [finding("f1", "model", ["a"])], gaps: [] }],
      tensions: [
        {
          id: "t1",
          statement: "The state and the county differ.",
          sides: [
            { label: "State", cites: ["a"] },
            { label: "County", cites: ["b"] },
          ],
          origin: "model",
        },
      ],
      narrative: [
        {
          id: "n1",
          note: "He describes the smell of the mud.",
          passages: [{ sourceId: "s1", startMs: 1000, endMs: 9000, page: null }],
          origin: "model",
        },
      ],
    };
    expect(parseSynthesisBody(JSON.parse(JSON.stringify(body)))).toEqual(body);
  });

  it("skips what is malformed instead of failing the page", () => {
    const parsed = parseSynthesisBody({
      sections: [
        {
          questionId: "q1",
          findings: [
            finding("ok", "model", ["a"]),
            { id: "no-certainty", statement: "x", cites: [] },
            { id: "blank", statement: "  ", certainty: "established", cites: [] },
          ],
          gaps: [{ id: "g", text: "" }],
        },
      ],
      tensions: [{ id: "t", statement: "one-sided", sides: [{ label: "Only", cites: [] }] }],
      narrative: [{ id: "n", note: "no passage", passages: [] }],
    });
    expect(parsed.sections[0]!.findings.map((f) => f.id)).toEqual(["ok"]);
    expect(parsed.sections[0]!.gaps).toEqual([]);
    expect(parsed.tensions).toEqual([]);
    expect(parsed.narrative).toEqual([]);
  });

  it("treats junk as empty, and defaults origin to model", () => {
    expect(isEmptySynthesis(parseSynthesisBody(null))).toBe(true);
    expect(isEmptySynthesis(parseSynthesisBody("nope"))).toBe(true);
    const parsed = parseSynthesisBody({
      sections: [
        { questionId: null, findings: [{ ...finding("f", "model", []), origin: "???" }], gaps: [] },
      ],
    });
    expect(parsed.sections[0]!.findings[0]!.origin).toBe("model");
  });
});

describe("carryPinned", () => {
  const accepted = new Set(["a", "b", "c"]);

  it("keeps a person's statements ahead of the model's, in the same question", () => {
    const base: SynthesisBody = {
      sections: [
        {
          questionId: "q1",
          findings: [finding("mine", "person", ["a"]), finding("old-model", "model", ["a"])],
          gaps: [{ id: "g-mine", text: "Mine.", origin: "person" }],
        },
      ],
      tensions: [],
      narrative: [],
    };
    const fresh: SynthesisBody = {
      sections: [{ questionId: "q1", findings: [finding("new-model", "model", ["b"])], gaps: [] }],
      tensions: [],
      narrative: [],
    };
    const merged = carryPinned(base, fresh, accepted);
    expect(merged.sections[0]!.findings.map((f) => f.id)).toEqual(["mine", "new-model"]);
    expect(merged.sections[0]!.gaps.map((g) => g.id)).toEqual(["g-mine"]);
  });

  it("drops the previous model statements: only the new run's stand", () => {
    const base: SynthesisBody = {
      sections: [{ questionId: "q1", findings: [finding("old", "model", ["a"])], gaps: [] }],
      tensions: [],
      narrative: [],
    };
    const merged = carryPinned(base, emptySynthesis(), accepted);
    expect(isEmptySynthesis(merged)).toBe(true);
  });

  it("trims a pinned statement's citations to findings still accepted, and keeps it even with none left", () => {
    const base: SynthesisBody = {
      sections: [
        { questionId: "q1", findings: [finding("mine", "person", ["a", "gone"])], gaps: [] },
      ],
      tensions: [],
      narrative: [],
    };
    const merged = carryPinned(base, emptySynthesis(), new Set(["a"]));
    expect(merged.sections[0]!.findings[0]!.cites).toEqual(["a"]);

    const orphaned = carryPinned(base, emptySynthesis(), new Set());
    expect(orphaned.sections[0]!.findings[0]!.cites).toEqual([]);
    expect(unsupportedIds(orphaned, new Set())).toEqual(new Set(["mine"]));
  });

  it("keeps a pinned statement for a question the new run did not write, and keeps question order", () => {
    const base: SynthesisBody = {
      sections: [
        { questionId: "q1", findings: [], gaps: [] },
        { questionId: "q2", findings: [finding("mine", "person", ["a"])], gaps: [] },
      ],
      tensions: [],
      narrative: [],
    };
    const fresh: SynthesisBody = {
      sections: [
        { questionId: "q3", findings: [finding("x", "model", ["b"])], gaps: [] },
        { questionId: "q1", findings: [finding("y", "model", ["c"])], gaps: [] },
      ],
      tensions: [],
      narrative: [],
    };
    const merged = carryPinned(base, fresh, accepted);
    expect(merged.sections.map((s) => s.questionId)).toEqual(["q1", "q2", "q3"]);
    expect(merged.sections[1]!.findings.map((f) => f.id)).toEqual(["mine"]);
  });

  it("carries a person's tension and narrative note, and replaces the model's", () => {
    const tension = (id: string, origin: "model" | "person") => ({
      id,
      statement: id,
      sides: [
        { label: "A", cites: ["a", "gone"] },
        { label: "B", cites: ["b"] },
      ],
      origin,
    });
    const base: SynthesisBody = {
      sections: [],
      tensions: [tension("mine", "person"), tension("old", "model")],
      narrative: [
        {
          id: "n-mine",
          note: "m",
          passages: [{ sourceId: "s", startMs: 0, endMs: 1, page: null }],
          origin: "person",
        },
        {
          id: "n-old",
          note: "o",
          passages: [{ sourceId: "s", startMs: 0, endMs: 1, page: null }],
          origin: "model",
        },
      ],
    };
    const merged = carryPinned(
      base,
      { sections: [], tensions: [tension("new", "model")], narrative: [] },
      accepted,
    );
    expect(merged.tensions.map((t) => t.id)).toEqual(["mine", "new"]);
    expect(merged.tensions[0]!.sides[0]!.cites).toEqual(["a"]);
    expect(merged.narrative.map((n) => n.id)).toEqual(["n-mine"]);
  });

  it("is the fresh body when there is no base", () => {
    const fresh = { ...emptySynthesis(), narrative: [] };
    expect(carryPinned(null, fresh, accepted)).toBe(fresh);
  });
});

describe("reading helpers", () => {
  it("lists every cited finding, across statements and tension sides", () => {
    const body: SynthesisBody = {
      sections: [{ questionId: null, findings: [finding("f", "model", ["a", "b"])], gaps: [] }],
      tensions: [
        {
          id: "t",
          statement: "s",
          sides: [
            { label: "A", cites: ["b"] },
            { label: "B", cites: ["c"] },
          ],
          origin: "model",
        },
      ],
      narrative: [],
    };
    expect(citedFindingIds(body)).toEqual(new Set(["a", "b", "c"]));
  });

  it("counts breadth by distinct sources and speakers, and ignores ids it cannot find", () => {
    const info = new Map([
      ["a", { sourceId: "s1", speakerId: "sam" }],
      ["b", { sourceId: "s1", speakerId: "sam" }],
      ["c", { sourceId: "s2", speakerId: null }],
    ]);
    expect(supportBreadth(["a", "b", "c", "missing"], info)).toEqual({
      findings: 3,
      sources: 2,
      speakers: 1,
    });
  });

  it("counts findings that changed after a version", () => {
    expect(
      findingsChangedSince(
        ["2026-10-10T10:00:00Z", "2026-10-12T10:00:00Z", "2026-10-13T10:00:00Z"],
        "2026-10-11T00:00:00Z",
      ),
    ).toBe(2);
    expect(findingsChangedSince(["2026-10-12T10:00:00Z"], "not a date")).toBe(0);
  });
});
