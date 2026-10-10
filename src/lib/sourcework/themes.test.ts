import { describe, expect, it } from "vitest";
import {
  EMPTY_BREADTH,
  buildThemeHistory,
  decisionsWaiting,
  evidenceSummary,
  filterEvidence,
  filterThemeRows,
  groupEvidenceBySource,
  isSingleSource,
  parseEvidenceShow,
  parseStatusFilter,
  questionLine,
  readsLikeTopic,
  sourcesLabel,
  validateMemo,
  validateThemeText,
  waitingSummary,
  type EvidenceItem,
  type ThemeRow,
} from "./themes";

function row(partial: Partial<ThemeRow> & { id: string }): ThemeRow {
  return {
    projectId: "p",
    title: partial.id,
    definition: "",
    memo: "",
    status: "accepted",
    origin: "model",
    createdBy: "u",
    createdAt: "2026-10-08T12:00:00Z",
    acceptedBy: null,
    acceptedAt: null,
    breadth: EMPTY_BREADTH,
    questionIds: [],
    ...partial,
  };
}

describe("validateThemeText", () => {
  it("collapses whitespace and requires both parts", () => {
    expect(validateThemeText({ title: "  A   theme  ", definition: " Says  something. " })).toEqual(
      {
        ok: true,
        title: "A theme",
        definition: "Says something.",
      },
    );
    expect(validateThemeText({ title: "", definition: "x" }).ok).toBe(false);
    expect(validateThemeText({ title: "x", definition: "  " }).ok).toBe(false);
    expect(validateThemeText({ title: "x".repeat(201), definition: "x" }).ok).toBe(false);
    expect(validateThemeText({ title: "x", definition: "x".repeat(601) }).ok).toBe(false);
    expect(validateThemeText({ title: 3, definition: null }).ok).toBe(false);
  });
});

describe("validateMemo", () => {
  it("keeps line breaks and trims the ends", () => {
    expect(validateMemo("  one\r\n\r\ntwo \n")).toEqual({ ok: true, memo: "one\n\ntwo" });
    expect(validateMemo("")).toEqual({ ok: true, memo: "" });
    expect(validateMemo("x".repeat(4001)).ok).toBe(false);
  });
});

describe("readsLikeTopic", () => {
  it("calls a short noun phrase a topic and a sentence a theme", () => {
    expect(readsLikeTopic("Childhood")).toBe(true);
    expect(readsLikeTopic("Tunnels and the base")).toBe(false);
    expect(readsLikeTopic("Locals treated the fort's tunnels as a private playground")).toBe(false);
    expect(readsLikeTopic("The fort  ")).toBe(true);
  });
});

describe("breadth labels", () => {
  it("writes sources out of the project's, never fewer than the theme has", () => {
    expect(sourcesLabel({ sourceCount: 3 }, 4)).toBe("3 of 4");
    expect(sourcesLabel({ sourceCount: 2 }, 1)).toBe("2 of 2");
  });

  it("flags one source only when the project has others", () => {
    expect(isSingleSource({ sourceCount: 1 }, 4)).toBe(true);
    expect(isSingleSource({ sourceCount: 1 }, 1)).toBe(false);
    expect(isSingleSource({ sourceCount: 2 }, 4)).toBe(false);
  });

  it("summarises evidence", () => {
    expect(evidenceSummary(11, 2)).toBe("11 supporting, 2 complicating");
    expect(evidenceSummary(4, 0)).toBe("4 supporting");
    expect(evidenceSummary(0, 1)).toBe("1 complicating");
    expect(evidenceSummary(0, 0)).toBe("No evidence yet");
  });
});

describe("questionLine", () => {
  it("lists distinct labels in question order", () => {
    const labels = new Map([
      ["a", "Q1"],
      ["b", "Q3"],
      ["c", "Q10"],
    ]);
    expect(questionLine(["c", "b", "a", "b", "missing"], labels)).toBe("Q1 · Q3 · Q10");
    expect(questionLine([], labels)).toBe("");
  });
});

describe("filterThemeRows", () => {
  const rows = [
    row({ id: "narrow", breadth: { ...EMPTY_BREADTH, sourceCount: 1, supporting: 9 } }),
    row({ id: "broad", breadth: { ...EMPTY_BREADTH, sourceCount: 3, supporting: 2 } }),
    row({ id: "suggested", status: "suggested", questionIds: ["q1"] }),
    row({ id: "rejected", status: "rejected" }),
  ];
  const base = { status: "all" as const, questionId: null, search: "" };

  it("ranks accepted by breadth, then suggestions, and hides rejected", () => {
    expect(filterThemeRows(rows, base).map((r) => r.id)).toEqual(["broad", "narrow", "suggested"]);
  });

  it("shows rejected only when asked for", () => {
    expect(filterThemeRows(rows, { ...base, status: "rejected" }).map((r) => r.id)).toEqual([
      "rejected",
    ]);
    expect(filterThemeRows(rows, { ...base, status: "suggested" }).map((r) => r.id)).toEqual([
      "suggested",
    ]);
  });

  it("filters by question and by title or definition", () => {
    expect(filterThemeRows(rows, { ...base, questionId: "q1" }).map((r) => r.id)).toEqual([
      "suggested",
    ]);
    const withText = [row({ id: "x", title: "Tunnels", definition: "Kids explored" }), ...rows];
    expect(filterThemeRows(withText, { ...base, search: "EXPLORED" }).map((r) => r.id)).toEqual([
      "x",
    ]);
  });
});

describe("parse filters", () => {
  it("falls back to the default", () => {
    expect(parseStatusFilter("suggested")).toBe("suggested");
    expect(parseStatusFilter("nope")).toBe("all");
    expect(parseStatusFilter(undefined)).toBe("all");
    expect(parseEvidenceShow("complicating")).toBe("complicating");
    expect(parseEvidenceShow("x")).toBe("all");
  });
});

describe("waiting strip", () => {
  it("totals the data points to review and orders the sources by how many", () => {
    const summary = waitingSummary({
      toReviewBySource: [
        { sourceId: "b", title: "Tom Reyes", count: 3 },
        { sourceId: "a", title: "Base newsletter, 1962", count: 11 },
        { sourceId: "c", title: "Empty", count: 0 },
      ],
      unthemed: 6,
      suggestedThemes: 1,
      suggestedMerges: 1,
    });
    expect(summary.toReview?.total).toBe(14);
    expect(summary.toReview?.sources.map((s) => s.sourceId)).toEqual(["a", "b"]);
    expect(summary.suggestions).toBe(2);
    expect(summary.clear).toBe(false);
  });

  it("is clear when nothing waits", () => {
    const summary = waitingSummary({
      toReviewBySource: [],
      unthemed: 0,
      suggestedThemes: 0,
      suggestedMerges: 0,
    });
    expect(summary.clear).toBe(true);
    expect(summary.toReview).toBeNull();
  });

  it("counts decisions as suggested themes plus merges", () => {
    expect(decisionsWaiting({ suggestedThemes: 1, suggestedMerges: 2 })).toBe(3);
  });
});

describe("evidence", () => {
  const items: EvidenceItem[] = [
    {
      dataPointId: "1",
      sourceId: "tom",
      sourceTitle: "Tom",
      stance: "supports",
      claim: "a",
      position: 5,
    },
    {
      dataPointId: "2",
      sourceId: "tom",
      sourceTitle: "Tom",
      stance: "supports",
      claim: "b",
      position: 1,
    },
    {
      dataPointId: "3",
      sourceId: "marlene",
      sourceTitle: "Marlene",
      stance: "complicates",
      claim: "c",
      position: 2,
    },
    {
      dataPointId: "4",
      sourceId: "marlene",
      sourceTitle: "Marlene",
      stance: "supports",
      claim: "d",
      position: 9,
    },
    {
      dataPointId: "5",
      sourceId: "news",
      sourceTitle: "Newsletter",
      stance: "complicates",
      claim: "e",
      position: 1,
    },
  ];

  it("groups by source, most support first, supporting before complicating inside", () => {
    const groups = groupEvidenceBySource(items);
    expect(groups.map((g) => g.sourceId)).toEqual(["tom", "marlene", "news"]);
    expect(groups[0]!.items.map((i) => i.dataPointId)).toEqual(["2", "1"]);
    expect(groups[1]!.items.map((i) => i.dataPointId)).toEqual(["4", "3"]);
    expect(groups[1]).toMatchObject({ supporting: 1, complicating: 1 });
  });

  it("filters by stance before grouping", () => {
    expect(filterEvidence(items, "complicating").map((i) => i.dataPointId)).toEqual(["3", "5"]);
    expect(filterEvidence(items, "supporting")).toHaveLength(3);
    expect(filterEvidence(items, "all")).toHaveLength(5);
    expect(
      groupEvidenceBySource(filterEvidence(items, "complicating")).map((g) => g.sourceId),
    ).toEqual(["marlene", "news"]);
  });
});

describe("buildThemeHistory", () => {
  const theme = {
    origin: "model" as const,
    status: "accepted" as const,
    createdAt: "2026-10-08T09:00:00Z",
    acceptedAt: "2026-10-08T10:00:00Z",
    runId: "run-1",
  };

  it("tells how it began, who accepted it, and what arrived later", () => {
    const history = buildThemeHistory({
      theme,
      createdByName: "Alex",
      acceptedByName: "Alex B.",
      memberships: [
        {
          createdAt: "2026-10-08T09:00:01Z",
          assignedBy: "model",
          runId: "run-1",
          sourceTitle: "Tom",
        },
        {
          createdAt: "2026-10-08T09:00:01Z",
          assignedBy: "model",
          runId: "run-1",
          sourceTitle: "Tom",
        },
        {
          createdAt: "2026-10-09T08:00:00Z",
          assignedBy: "model",
          runId: "run-2",
          sourceTitle: "Marlene",
        },
        {
          createdAt: "2026-10-09T09:00:00Z",
          assignedBy: "model",
          runId: "run-2",
          sourceTitle: "Marlene",
        },
        {
          createdAt: "2026-10-09T09:30:00Z",
          assignedBy: "person",
          runId: null,
          sourceTitle: "Marlene",
        },
      ],
    });
    expect(history.map((entry) => entry.text)).toEqual([
      "Review themes proposed it from 2 data points",
      "Alex B. accepted the theme",
      "2 data points assigned from Marlene",
      "1 data point added from Marlene",
    ]);
  });

  it("says who made a theme by hand", () => {
    const history = buildThemeHistory({
      theme: { ...theme, origin: "person", runId: null, acceptedAt: null, status: "accepted" },
      createdByName: "Alex",
      acceptedByName: null,
      memberships: [],
    });
    expect(history.map((entry) => entry.text)).toEqual(["Alex created the theme"]);
  });
});
