import { describe, expect, it } from "vitest";
import type { RdPostStatus } from "@/lib/database.types";
import {
  availableStatusActions,
  groupForRoadmap,
  normalizeSort,
  POST_STATUS_BADGE,
  ROADMAP_STATUSES,
  sortPosts,
  STATUS_ACTION_LABEL,
  validatePostInput,
  validateStatusChange,
} from "./posts";

const ALL_STATUSES: RdPostStatus[] = [
  "open",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
];

function input(overrides: Partial<Parameters<typeof validatePostInput>[0]> = {}) {
  return {
    title: "Search should cover document sources",
    bodyText: "It currently misses PDFs.",
    kind: "improvement" as const,
    toolId: null,
    proposedToolName: "",
    ...overrides,
  };
}

describe("availableStatusActions", () => {
  it("never offers a transition to the status the post is already in", () => {
    for (const status of ALL_STATUSES) {
      expect(availableStatusActions(status)).not.toContain(status);
    }
  });

  it("leaves every status reachable from somewhere", () => {
    const reachable = new Set(ALL_STATUSES.flatMap(availableStatusActions));
    for (const status of ALL_STATUSES) {
      expect(reachable).toContain(status);
    }
  });

  it("leaves every status escapable — no status is a dead end", () => {
    for (const status of ALL_STATUSES) {
      expect(availableStatusActions(status).length).toBeGreaterThan(0);
    }
  });

  it("routes a fresh request through review, planning, or a decline", () => {
    expect(availableStatusActions("open")).toEqual(["under_review", "planned", "declined"]);
  });

  it("lets a premature 'shipped' be walked back", () => {
    expect(availableStatusActions("shipped")).toContain("in_progress");
  });

  it("lets a declined request be reconsidered", () => {
    expect(availableStatusActions("declined")).toContain("open");
  });
});

describe("label maps", () => {
  it("covers every status, so no transition button renders blank", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_ACTION_LABEL[status]).toBeTruthy();
      expect(POST_STATUS_BADGE[status].label).toBeTruthy();
    }
  });
});

describe("validatePostInput", () => {
  it("accepts an ordinary request", () => {
    expect(validatePostInput(input())).toBeNull();
  });

  it("rejects a title under three characters", () => {
    expect(validatePostInput(input({ title: "ab" }))).toContain("three characters");
  });

  it("rejects a title over the constraint's limit", () => {
    expect(validatePostInput(input({ title: "x".repeat(161) }))).toContain("at most 160");
  });

  it("rejects an empty body — a title on its own is hard to act on", () => {
    expect(validatePostInput(input({ bodyText: "   " }))).toContain("Say what you want");
  });

  it("rejects a body past the size cap", () => {
    expect(validatePostInput(input({ bodyText: "x".repeat(20_001) }))).toContain("too long");
  });

  it("makes a new-tool request name its target one way or the other", () => {
    expect(validatePostInput(input({ kind: "new_tool" }))).toContain("what it should be called");
    expect(validatePostInput(input({ kind: "new_tool", toolId: "abc" }))).toBeNull();
    expect(
      validatePostInput(input({ kind: "new_tool", proposedToolName: "Newsletter Builder" })),
    ).toBeNull();
  });
});

describe("validateStatusChange", () => {
  it("requires a reason to decline", () => {
    expect(validateStatusChange("declined", "  ")).toContain("Say why");
    expect(validateStatusChange("declined", "Duplicate of #12")).toBeNull();
  });

  it("does not ask for a note on any other transition", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "declined")) {
      expect(validateStatusChange(status, "")).toBeNull();
    }
  });
});

describe("sortPosts", () => {
  const posts = [
    { id: "a", voteCount: 1, created_at: "2026-08-01T00:00:00Z" },
    { id: "b", voteCount: 5, created_at: "2026-07-01T00:00:00Z" },
    { id: "c", voteCount: 5, created_at: "2026-07-15T00:00:00Z" },
  ];

  it("puts the most-wanted first, breaking ties with the newer post", () => {
    expect(sortPosts(posts, "top").map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("ignores votes entirely when sorting by newest", () => {
    expect(sortPosts(posts, "new").map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate its argument", () => {
    const original = [...posts];
    sortPosts(posts, "top");
    expect(posts).toEqual(original);
  });
});

describe("normalizeSort", () => {
  it("defaults to most-wanted for anything it does not recognize", () => {
    expect(normalizeSort(undefined)).toBe("top");
    expect(normalizeSort("nonsense")).toBe("top");
    expect(normalizeSort("new")).toBe("new");
  });
});

describe("groupForRoadmap", () => {
  it("returns every roadmap column in order, including empty ones", () => {
    const grouped = groupForRoadmap([
      { id: "a", status: "planned" as const },
      { id: "b", status: "shipped" as const },
    ]);
    expect(grouped.map((column) => column.status)).toEqual(ROADMAP_STATUSES);
    expect(grouped.find((c) => c.status === "in_progress")?.posts).toEqual([]);
  });

  it("leaves open and under-review posts out — the roadmap is what was decided", () => {
    const grouped = groupForRoadmap([
      { id: "a", status: "open" as const },
      { id: "b", status: "under_review" as const },
    ]);
    expect(grouped.every((column) => column.posts.length === 0)).toBe(true);
  });
});
