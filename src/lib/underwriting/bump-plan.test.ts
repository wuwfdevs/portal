import { describe, expect, it } from "vitest";
import {
  isMovableCredit,
  planBump,
  type BreakItemLike,
  type BumpBreak,
  type BumpUnit,
} from "./bump-plan";
import type { CandidateBreak } from "./inventory-selection";

const NOW = "2026-09-28T09:00:00Z";
const DAY = "2026-09-29";

function item(overrides: Partial<BreakItemLike> & { itemId: string }): BreakItemLike {
  return {
    position: 1,
    durationSeconds: 30,
    placementId: `pl-${overrides.itemId}`,
    scheduleLineId: `line-${overrides.itemId}`,
    contractId: `c-${overrides.itemId}`,
    underwriterId: `uw-${overrides.itemId}`,
    categoryId: null,
    timeMode: "any",
    serviceLevel: "guaranteed",
    makegoodId: null,
    bucketId: "bucket-x",
    hasOutcome: false,
    ...overrides,
  };
}

function host(itemId: string, position = 1): BreakItemLike {
  return {
    itemId,
    position,
    durationSeconds: 30,
    placementId: null,
    scheduleLineId: null,
    contractId: null,
    underwriterId: null,
    categoryId: null,
    timeMode: null,
    serviceLevel: null,
    makegoodId: null,
    bucketId: null,
    hasOutcome: false,
  };
}

function candidate(overrides: Partial<CandidateBreak> & { breakId: string }): CandidateBreak {
  return {
    airDate: DAY,
    minutesOfDay: 7 * 60 + 6,
    scheduledAt: `${DAY}T12:06:00Z`,
    rundownStatus: "generated",
    remainingSeconds: 60,
    lastItemUnderwriterId: null,
    lastItemCategoryId: null,
    holdsThisContract: false,
    bucketId: "bucket-x",
    ...overrides,
  };
}

function full(
  overrides: Partial<BumpBreak> & { breakId: string; items: BreakItemLike[] },
): BumpBreak {
  return { ...candidate(overrides), remainingSeconds: 0, ...overrides };
}

const unit: BumpUnit = {
  scheduleLineId: "line-exact",
  bucketId: "bucket-exact",
  contractId: "c-exact",
  underwriterId: "uw-exact",
  categoryId: null,
  copyDurationSeconds: 30,
};

describe("isMovableCredit", () => {
  it("moves only a fresh window/preferred/any placement with no outcome", () => {
    expect(isMovableCredit(item({ itemId: "a" }))).toBe(true);
    expect(isMovableCredit(item({ itemId: "a", timeMode: "window" }))).toBe(true);
    expect(isMovableCredit(item({ itemId: "a", timeMode: "exact" }))).toBe(false);
    expect(isMovableCredit(item({ itemId: "a", timeMode: "opening" }))).toBe(false);
    expect(isMovableCredit(item({ itemId: "a", makegoodId: "mg" }))).toBe(false);
    expect(isMovableCredit(item({ itemId: "a", hasOutcome: true }))).toBe(false);
    expect(isMovableCredit(host("h"))).toBe(false);
  });
});

describe("planBump", () => {
  it("seats an exact line by moving an any-time credit to its other legal break", () => {
    const opening = full({ breakId: "brk-706", items: [item({ itemId: "a" })] });
    const alternatives = new Map([
      ["line-a", [candidate({ breakId: "brk-749", minutesOfDay: 7 * 60 + 49 })]],
    ]);
    const plan = planBump(unit, [opening], alternatives, NOW);
    expect(plan).toEqual({
      kind: "bump",
      move: {
        placementId: "pl-a",
        itemId: "a",
        movedScheduleLineId: "line-a",
        movedContractId: "c-a",
        fromBreakId: "brk-706",
        toBreakId: "brk-749",
        seatBreakId: "brk-706",
      },
    });
  });

  it("moves nothing when the only occupant has no other legal break", () => {
    const opening = full({ breakId: "brk-706", items: [item({ itemId: "a" })] });
    const plan = planBump(unit, [opening], new Map(), NOW);
    expect(plan).toEqual({
      kind: "conflict",
      conflict: {
        scheduleLineId: "line-exact",
        bucketId: "bucket-exact",
        reason: "no_legal_alternative",
        breakIds: ["brk-706"],
      },
    });
  });

  it("refuses a frozen rundown and a past break, on either end of the move", () => {
    const live = full({
      breakId: "brk-706",
      rundownStatus: "in_progress",
      items: [item({ itemId: "a" })],
    });
    expect(
      planBump(unit, [live], new Map([["line-a", [candidate({ breakId: "brk-749" })]]]), NOW),
    ).toMatchObject({ kind: "conflict", conflict: { reason: "no_eligible_break", breakIds: [] } });

    const open = full({ breakId: "brk-706", items: [item({ itemId: "a" })] });
    const frozenAlternative = candidate({ breakId: "brk-749", rundownStatus: "submitted" });
    const pastAlternative = candidate({ breakId: "brk-500", scheduledAt: "2026-09-28T08:00:00Z" });
    expect(
      planBump(unit, [open], new Map([["line-a", [frozenAlternative, pastAlternative]]]), NOW),
    ).toMatchObject({ kind: "conflict", conflict: { reason: "no_legal_alternative" } });
  });

  it("never moves a credit outside its own demand bucket", () => {
    const open = full({ breakId: "brk-706", items: [item({ itemId: "a", bucketId: "week-1" })] });
    const nextWeek = candidate({ breakId: "brk-next", airDate: "2026-10-06", bucketId: "week-2" });
    expect(planBump(unit, [open], new Map([["line-a", [nextWeek]]]), NOW)).toMatchObject({
      kind: "conflict",
      conflict: { reason: "no_legal_alternative" },
    });
    const sameWeek = candidate({ breakId: "brk-same", airDate: "2026-09-30", bucketId: "week-1" });
    expect(planBump(unit, [open], new Map([["line-a", [nextWeek, sameWeek]]]), NOW)).toMatchObject({
      kind: "bump",
      move: { toBreakId: "brk-same" },
    });
  });

  it("refuses a move that would run the same underwriter or industry back to back", () => {
    const open = full({
      breakId: "brk-706",
      items: [item({ itemId: "a", categoryId: "lawyers" })],
    });
    const adjacent = candidate({ breakId: "brk-749", lastItemCategoryId: "lawyers" });
    expect(planBump(unit, [open], new Map([["line-a", [adjacent]]]), NOW)).toMatchObject({
      kind: "conflict",
      conflict: { reason: "no_legal_alternative" },
    });

    // The seat itself must not land next to the constrained unit's own industry.
    const lawyerUnit: BumpUnit = { ...unit, categoryId: "lawyers" };
    const twoUp = full({
      breakId: "brk-706",
      items: [
        item({ itemId: "stay", position: 1, categoryId: "lawyers", timeMode: "exact" }),
        item({ itemId: "go", position: 2 }),
      ],
    });
    expect(
      planBump(
        lawyerUnit,
        [twoUp],
        new Map([["line-go", [candidate({ breakId: "brk-749" })]]]),
        NOW,
      ),
    ).toMatchObject({ kind: "conflict", conflict: { reason: "no_legal_alternative" } });
  });

  it("moves bonus before guaranteed, then the credit with the most alternatives", () => {
    const open = full({
      breakId: "brk-706",
      items: [
        item({ itemId: "g", position: 1, serviceLevel: "guaranteed" }),
        item({ itemId: "b", position: 2, serviceLevel: "bonus" }),
      ],
    });
    const homes = new Map([
      ["line-g", [candidate({ breakId: "g1" }), candidate({ breakId: "g2" })]],
      ["line-b", [candidate({ breakId: "b1" })]],
    ]);
    expect(planBump(unit, [open], homes, NOW)).toMatchObject({
      kind: "bump",
      move: { itemId: "b" },
    });

    const twoGuaranteed = full({
      breakId: "brk-706",
      items: [item({ itemId: "one", position: 1 }), item({ itemId: "many", position: 2 })],
    });
    const homes2 = new Map([
      ["line-one", [candidate({ breakId: "o1" })]],
      ["line-many", [candidate({ breakId: "m1" }), candidate({ breakId: "m2" })]],
    ]);
    expect(planBump(unit, [twoGuaranteed], homes2, NOW)).toMatchObject({
      kind: "bump",
      move: { itemId: "many" },
    });
  });

  it("names host content and fixed credits as what is in the way, and never displaces them", () => {
    const promos = full({ breakId: "brk-706", items: [host("promo"), host("psa", 2)] });
    expect(planBump(unit, [promos], new Map(), NOW)).toMatchObject({
      kind: "conflict",
      conflict: { reason: "host_content_only" },
    });
    const fixed = full({
      breakId: "brk-706",
      items: [
        item({ itemId: "mg", makegoodId: "mg-1" }),
        item({ itemId: "aired", hasOutcome: true }),
      ],
    });
    expect(planBump(unit, [fixed], new Map(), NOW)).toMatchObject({
      kind: "conflict",
      conflict: { reason: "no_movable_credit" },
    });
  });

  it("skips a move that would not free enough room", () => {
    const tight = full({
      breakId: "brk-706",
      remainingSeconds: 5,
      items: [item({ itemId: "short", durationSeconds: 15 })],
    });
    const wide: BumpUnit = { ...unit, copyDurationSeconds: 30 };
    expect(
      planBump(wide, [tight], new Map([["line-short", [candidate({ breakId: "x" })]]]), NOW),
    ).toMatchObject({
      kind: "conflict",
      conflict: { reason: "no_legal_alternative" },
    });
  });
});
