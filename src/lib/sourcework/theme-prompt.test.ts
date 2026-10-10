import { describe, expect, it } from "vitest";
import {
  CANDIDATE_CAP,
  MAX_NEW_THEMES,
  buildAssignmentInput,
  buildAssignmentOutputSchema,
  buildReviewInput,
  buildReviewOutputSchema,
  chooseCandidateThemes,
  normalizeTitle,
  parseAssignmentOutput,
  parseReviewOutput,
} from "./theme-prompt";

describe("parseAssignmentOutput", () => {
  const counts = { points: 3, themes: 2 };

  it("reads fits and the points the model placed nowhere", () => {
    const parsed = parseAssignmentOutput(
      JSON.stringify({
        assignments: [
          { point_number: 1, fits: [{ theme_number: 2, stance: "supports" }] },
          {
            point_number: 2,
            fits: [
              { theme_number: 1, stance: "complicates" },
              { theme_number: 2, stance: "supports" },
            ],
          },
          { point_number: 3, fits: [] },
        ],
      }),
      counts,
    );
    expect(parsed.assignments).toEqual([
      { pointIndex: 0, themeIndex: 1, stance: "supports" },
      { pointIndex: 1, themeIndex: 0, stance: "complicates" },
      { pointIndex: 1, themeIndex: 1, stance: "supports" },
    ]);
    expect(parsed.noFit).toEqual([2]);
  });

  it("drops numbers the lists don't have rather than clamping them", () => {
    const parsed = parseAssignmentOutput(
      JSON.stringify({
        assignments: [
          { point_number: 9, fits: [{ theme_number: 1, stance: "supports" }] },
          {
            point_number: 1,
            fits: [
              { theme_number: 7, stance: "supports" },
              { theme_number: 1, stance: "maybe" },
              { theme_number: 2, stance: "supports" },
              { theme_number: 2, stance: "complicates" },
            ],
          },
        ],
      }),
      counts,
    );
    expect(parsed.assignments).toEqual([{ pointIndex: 0, themeIndex: 1, stance: "supports" }]);
    expect(parsed.dropped).toMatchObject({ unknown_point: 1, unknown_theme: 1, bad_stance: 1 });
  });

  it("keeps a point's first answer and counts an unreadable one", () => {
    const twice = parseAssignmentOutput(
      JSON.stringify({
        assignments: [
          { point_number: 1, fits: [{ theme_number: 1, stance: "supports" }] },
          { point_number: 1, fits: [{ theme_number: 2, stance: "supports" }] },
        ],
      }),
      counts,
    );
    expect(twice.assignments).toHaveLength(1);
    expect(parseAssignmentOutput("not json", counts).dropped.unreadable).toBe(1);
    expect(parseAssignmentOutput("{}", counts).dropped.unreadable).toBe(1);
  });
});

describe("chooseCandidateThemes", () => {
  const themes = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` }));

  it("offers every theme when there are few", () => {
    expect(
      chooseCandidateThemes({
        themes: themes.slice(0, 4),
        nearestByPoint: new Map(),
        pointIds: ["p"],
      }),
    ).toHaveLength(4);
  });

  it("narrows to the union of each point's nearest when every point has some", () => {
    const nearest = new Map([
      ["p1", ["t3", "t7"]],
      ["p2", ["t7", "t11"]],
    ]);
    expect(
      chooseCandidateThemes({ themes, nearestByPoint: nearest, pointIds: ["p1", "p2"] }).map(
        (t) => t.id,
      ),
    ).toEqual(["t3", "t7", "t11"]);
  });

  it("falls back to the first few when a point has no neighbours", () => {
    const nearest = new Map([["p1", ["t3"]]]);
    const chosen = chooseCandidateThemes({
      themes,
      nearestByPoint: nearest,
      pointIds: ["p1", "p2"],
    });
    expect(chosen).toHaveLength(CANDIDATE_CAP);
    expect(chosen[0]!.id).toBe("t0");
  });
});

describe("parseReviewOutput", () => {
  const context = { pointCount: 4, acceptedThemeCount: 3, existingTitles: ["Already here"] };
  const good = {
    title: "Access closed gradually, and nobody announced it",
    definition: "The fence gap was welded shut with no notice.",
    members: [
      { point_number: 1, stance: "supports" },
      { point_number: 3, stance: "complicates" },
    ],
  };

  it("reads a theme and resolves its members to indexes", () => {
    const parsed = parseReviewOutput(JSON.stringify({ new_themes: [good], merges: [] }), context);
    expect(parsed.themes).toEqual([
      {
        title: good.title,
        definition: good.definition,
        members: [
          { pointIndex: 0, stance: "supports" },
          { pointIndex: 2, stance: "complicates" },
        ],
      },
    ]);
  });

  it("drops what it can't trust, and counts why", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({
        new_themes: [
          { ...good, title: "already   HERE!" },
          { ...good, title: "" },
          { ...good, members: [{ point_number: 1, stance: "supports" }] },
          {
            ...good,
            members: [
              { point_number: 1, stance: "supports" },
              { point_number: 1, stance: "supports" },
              { point_number: 9, stance: "supports" },
            ],
          },
          good,
          { ...good, title: "ACCESS closed gradually and nobody announced it" },
        ],
        merges: [],
      }),
      context,
    );
    expect(parsed.themes).toHaveLength(1);
    expect(parsed.dropped).toMatchObject({ duplicate_title: 2, bad_text: 1, too_few_points: 2 });
  });

  it("caps the number of new themes", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...good,
      title: `Theme number ${i} says a thing`,
    }));
    expect(
      parseReviewOutput(JSON.stringify({ new_themes: many, merges: [] }), context).themes,
    ).toHaveLength(MAX_NEW_THEMES);
  });

  it("reads merges between accepted themes and drops the rest", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({
        new_themes: [],
        merges: [
          { from_theme_number: 1, into_theme_number: 2, reason: "  Same behavior. " },
          { from_theme_number: 2, into_theme_number: 1, reason: "The same again" },
          { from_theme_number: 3, into_theme_number: 3, reason: "x" },
          { from_theme_number: 4, into_theme_number: 1, reason: "x" },
          { from_theme_number: 3, into_theme_number: 1, reason: "" },
          { from_theme_number: 3, into_theme_number: 2, reason: "Both about the fence" },
        ],
      }),
      { ...context, existingMergePairs: new Set(["0:2"]) },
    );
    expect(parsed.merges).toEqual([
      { fromIndex: 0, intoIndex: 1, reason: "Same behavior." },
      { fromIndex: 2, intoIndex: 1, reason: "Both about the fence" },
    ]);
    expect(parsed.dropped.bad_merge).toBe(3);
    expect(parsed.dropped.duplicate_merge).toBe(1);
  });

  it("counts an unreadable answer", () => {
    expect(parseReviewOutput("nope", context).dropped.unreadable).toBe(1);
    expect(parseReviewOutput(JSON.stringify({ new_themes: [] }), context).dropped.unreadable).toBe(
      1,
    );
  });
});

describe("normalizeTitle", () => {
  it("ignores case, spacing and punctuation", () => {
    expect(normalizeTitle("  The  base—was a neighbor, not a barrier! ")).toBe(
      "the basewas a neighbor not a barrier",
    );
  });
});

describe("inputs and schemas", () => {
  it("numbers themes and points and tags each point", () => {
    const input = buildAssignmentInput({
      projectTitle: "Fort",
      themes: [{ number: 1, title: "T", definition: "D" }],
      points: [
        {
          number: 1,
          claim: "He went in.",
          sourceTitle: "Tom",
          speaker: "Tom Reyes",
          kind: "firsthand",
          questionLabel: "Q1",
        },
        {
          number: 2,
          claim: "A gate.",
          sourceTitle: "News",
          speaker: null,
          kind: "factual",
          questionLabel: null,
        },
      ],
    });
    expect(input).toContain("1. T — D");
    expect(input).toContain("1. [Tom · Tom Reyes · firsthand · answers Q1] He went in.");
    expect(input).toContain("2. [News · factual · story material] A gate.");
  });

  it("lists accepted themes with a T prefix and what not to propose again", () => {
    const input = buildReviewInput({
      projectTitle: "Fort",
      projectDescription: null,
      projectSources: 4,
      questions: [{ label: "Q1", question: "What happened?" }],
      acceptedThemes: [{ number: 1, title: "T", definition: "D", sources: 1 }],
      settledTitles: ["Declined one"],
      points: [
        {
          number: 1,
          claim: "c",
          sourceTitle: "s",
          speaker: null,
          kind: "opinion",
          questionLabel: null,
        },
      ],
    });
    expect(input).toContain("The project has 4 sources.");
    expect(input).toContain("T1. T — D (1 source)");
    expect(input).toContain("- Declined one");
  });

  it("builds strict schemas", () => {
    for (const schema of [buildAssignmentOutputSchema(), buildReviewOutputSchema()]) {
      expect(schema.additionalProperties).toBe(false);
      expect(Array.isArray(schema.required)).toBe(true);
    }
  });
});
