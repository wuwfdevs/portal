import { describe, expect, it } from "vitest";
import {
  ancestryPath,
  canDrillDown,
  canPromote,
  canReject,
  computeTreeLayout,
  contextNoteCount,
  descendantIds,
  DIAGNOSIS_KINDS,
  inheritedContextNotes,
  labelForDepth,
  labelForDiagnosis,
  visibleQuestions,
  type ContextNoteRecord,
  type QuestionRecord,
} from "./tree";

function question(overrides: Partial<QuestionRecord> & Pick<QuestionRecord, "id">): QuestionRecord {
  return {
    inquiryId: "inq1",
    parentId: null,
    depth: 0,
    text: "Some question",
    status: "active",
    diagnosisKind: null,
    diagnosisNote: null,
    reframedFromText: null,
    manualDx: null,
    manualDy: null,
    createdBy: null,
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
    ...overrides,
  };
}

const root = question({ id: "root", depth: 0, parentId: null });
const line1 = question({ id: "line1", depth: 1, parentId: "root" });
const q1 = question({ id: "q1", depth: 2, parentId: "line1" });
const q2 = question({ id: "q2", depth: 3, parentId: "q1" });
const rejected = question({ id: "rejected", depth: 1, parentId: "root", status: "rejected" });
const rejectedChild = question({ id: "rejectedChild", depth: 2, parentId: "rejected" });

const tree = [root, line1, q1, q2, rejected, rejectedChild];

describe("labelForDepth", () => {
  it("names the root, depth-1, and deeper levels distinctly", () => {
    expect(labelForDepth(0)).toBe("Guiding question");
    expect(labelForDepth(1)).toBe("Line of inquiry");
    expect(labelForDepth(2)).toBe("Question");
    expect(labelForDepth(5)).toBe("Question");
  });
});

describe("labelForDiagnosis", () => {
  it("labels every recognized diagnosis kind, including the over-narrowing one", () => {
    for (const kind of DIAGNOSIS_KINDS) {
      expect(labelForDiagnosis(kind)).toBeTruthy();
    }
    expect(labelForDiagnosis("too_narrow_process_step")).toBe(
      "A reporting step, not a story question",
    );
  });
});

describe("canReject / canPromote / canDrillDown", () => {
  it("never allows rejecting or promoting the root", () => {
    expect(canReject(root)).toBe(false);
    expect(canPromote(root)).toBe(false);
  });

  it("allows both rejecting and promoting a line of inquiry — depth no longer gates promotion", () => {
    expect(canReject(line1)).toBe(true);
    expect(canPromote(line1)).toBe(true);
  });

  it("allows both on a deeper active question too", () => {
    expect(canReject(q1)).toBe(true);
    expect(canPromote(q1)).toBe(true);
  });

  it("disallows reject/promote on a non-active question", () => {
    expect(canReject(rejected)).toBe(false);
    expect(canPromote({ ...q1, status: "promoted" })).toBe(false);
  });

  it("allows drilling down from any active question, including the root", () => {
    expect(canDrillDown(root)).toBe(true);
    expect(canDrillDown(q1)).toBe(true);
    expect(canDrillDown(rejected)).toBe(false);
  });
});

describe("ancestryPath", () => {
  it("walks from a node up to the root, nearest-first", () => {
    expect(ancestryPath(tree, "q2")).toEqual(["q2", "q1", "line1", "root"]);
  });

  it("returns just the root for the root itself", () => {
    expect(ancestryPath(tree, "root")).toEqual(["root"]);
  });

  it("returns an empty path for an unknown or null id", () => {
    expect(ancestryPath(tree, "missing")).toEqual([]);
    expect(ancestryPath(tree, null)).toEqual([]);
  });
});

describe("descendantIds", () => {
  it("collects every descendant, not just direct children", () => {
    expect(descendantIds(tree, "line1")).toEqual(new Set(["q1", "q2"]));
  });

  it("is empty for a leaf", () => {
    expect(descendantIds(tree, "q2")).toEqual(new Set());
  });
});

describe("visibleQuestions", () => {
  it("hides a rejected question and its descendants, keeps everything else", () => {
    const visible = visibleQuestions(tree).map((q) => q.id);
    expect(visible).toEqual(["root", "line1", "q1", "q2"]);
    expect(visible).not.toContain("rejected");
    expect(visible).not.toContain("rejectedChild");
  });
});

describe("computeTreeLayout", () => {
  it("places each node in its depth's column and centers a parent over its children", () => {
    const layout = computeTreeLayout(tree);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    // Depth becomes an x column (340px apart).
    expect(byId.get("root")!.x).toBe(0);
    expect(byId.get("line1")!.x).toBe(340);
    expect(byId.get("q1")!.x).toBe(680);
    // A single-child chain keeps the same vertical center all the way down.
    expect(byId.get("root")!.y + byId.get("root")!.height / 2).toBeCloseTo(
      byId.get("q2")!.y + byId.get("q2")!.height / 2,
      5,
    );
    // Rejected nodes never get laid out at all.
    expect(byId.has("rejected")).toBe(false);
  });

  it("offsets a node by its persisted manual drag without disturbing the base layout math", () => {
    const dragged = tree.map((q) => (q.id === "q1" ? { ...q, manualDx: 50, manualDy: -20 } : q));
    const base = computeTreeLayout(tree);
    const withDrag = computeTreeLayout(dragged);
    const baseQ1 = base.nodes.find((n) => n.id === "q1")!;
    const draggedQ1 = withDrag.nodes.find((n) => n.id === "q1")!;
    expect(draggedQ1.x).toBe(baseQ1.x + 50);
    expect(draggedQ1.y).toBe(baseQ1.y - 20);
  });

  it("draws one edge per visible parent/child pair", () => {
    const layout = computeTreeLayout(tree);
    expect(layout.edges).toHaveLength(3); // root->line1, line1->q1, q1->q2
    expect(layout.edges.every((e) => e.d.startsWith("M "))).toBe(true);
  });
});

function note(
  overrides: Partial<ContextNoteRecord> & Pick<ContextNoteRecord, "id" | "questionId">,
): ContextNoteRecord {
  return {
    kind: "note",
    body: "Some context",
    evidentiaryStatus: "hunch",
    sourceTitle: null,
    sourceUrl: null,
    createdBy: null,
    createdAt: "2026-08-20T00:00:00Z",
    ...overrides,
  };
}

describe("inheritedContextNotes / contextNoteCount", () => {
  const notes = [
    note({ id: "n-root", questionId: "root" }),
    note({ id: "n-line1", questionId: "line1" }),
    note({ id: "n-q1-a", questionId: "q1" }),
    note({ id: "n-q1-b", questionId: "q1" }),
  ];

  it("includes a question's own notes plus every ancestor's, nearest-first", () => {
    const result = inheritedContextNotes(tree, notes, "q1");
    expect(result.map((r) => r.note.id)).toEqual(["n-q1-a", "n-q1-b", "n-line1", "n-root"]);
    expect(result.find((r) => r.note.id === "n-q1-a")!.inherited).toBe(false);
    expect(result.find((r) => r.note.id === "n-root")!.inherited).toBe(true);
  });

  it("the root only ever sees its own notes — attaching there covers the whole inquiry precisely because everything descends from it", () => {
    const result = inheritedContextNotes(tree, notes, "root");
    expect(result.map((r) => r.note.id)).toEqual(["n-root"]);
  });

  it("counts own + inherited notes", () => {
    expect(contextNoteCount(tree, notes, "q1")).toBe(4);
    expect(contextNoteCount(tree, notes, "q2")).toBe(4);
    expect(contextNoteCount(tree, notes, "line1")).toBe(2);
    expect(contextNoteCount(tree, notes, "root")).toBe(1);
  });
});
