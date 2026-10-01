import { describe, expect, it } from "vitest";
import {
  countByExceptionFilter,
  defaultExceptionFilter,
  exceptionStep,
  matchesExceptionFilter,
  type ExceptionStepInput,
} from "./exception-filters";

const base = {
  resolution_status: "open",
  makegood_approval: "not_required",
  makegoods: [],
} as const;
const awaiting = { status: "scheduled", scheduled_placement_id: null } as const;
const placed = { status: "scheduled", scheduled_placement_id: "p1" } as const;
const aired = { status: "aired", scheduled_placement_id: "p2" } as const;
const cancelled = { status: "cancelled", scheduled_placement_id: null } as const;

const at = (patch: Partial<ExceptionStepInput>): ExceptionStepInput => ({ ...base, ...patch });

describe("exceptionStep", () => {
  it("an open exception with no makegood needs a decision", () => {
    expect(exceptionStep(base)).toBe("decision");
  });
  it("a resolved exception is resolved whatever its makegoods say", () => {
    expect(exceptionStep(at({ resolution_status: "resolved", makegoods: [awaiting] }))).toBe(
      "resolved",
    );
  });
  it("a pending agency answer comes before any makegood state", () => {
    expect(exceptionStep(at({ makegood_approval: "pending", makegoods: [awaiting] }))).toBe(
      "agency",
    );
  });
  it("a makegood with no break is awaiting one, even beside a placed one", () => {
    expect(exceptionStep(at({ makegoods: [awaiting] }))).toBe("awaiting_break");
    expect(exceptionStep(at({ makegoods: [placed, awaiting] }))).toBe("awaiting_break");
  });
  it("a placed makegood is scheduled", () => {
    expect(exceptionStep(at({ makegoods: [placed, cancelled] }))).toBe("makegood_scheduled");
  });
  it("cancelled or already-aired makegoods leave the decision open", () => {
    expect(exceptionStep(at({ makegoods: [cancelled] }))).toBe("decision");
    expect(exceptionStep(at({ makegoods: [aired] }))).toBe("decision");
    expect(exceptionStep(at({ makegood_approval: "declined" }))).toBe("decision");
  });
});

describe("filters", () => {
  const list = [
    base,
    at({ makegood_approval: "pending" }),
    at({ makegoods: [awaiting] }),
    at({ resolution_status: "resolved" }),
  ];
  it("all matches everything; a step matches only itself", () => {
    expect(list.every((e) => matchesExceptionFilter(e, "all"))).toBe(true);
    expect(list.filter((e) => matchesExceptionFilter(e, "agency"))).toHaveLength(1);
  });
  it("counts every step and the total", () => {
    expect(countByExceptionFilter(list)).toEqual({
      decision: 1,
      agency: 1,
      awaiting_break: 1,
      makegood_scheduled: 0,
      resolved: 1,
      all: 4,
    });
  });
  it("opens on the first open step with anything in it", () => {
    expect(defaultExceptionFilter(list)).toBe("decision");
    expect(defaultExceptionFilter([at({ makegoods: [placed] })])).toBe("makegood_scheduled");
    expect(defaultExceptionFilter([at({ resolution_status: "resolved" })])).toBe("all");
    expect(defaultExceptionFilter([])).toBe("all");
  });
});
