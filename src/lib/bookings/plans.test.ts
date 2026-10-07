import { describe, expect, it } from "vitest";
import {
  currentPlan,
  planForDate,
  rangesOverlap,
  splitBlackoutAcrossPlans,
  type PlanSpan,
} from "./plans";

const FALL: PlanSpan = {
  id: "fall",
  starts_on: "2026-08-17",
  ends_on: "2026-12-18",
  status: "active",
};
const SPRING: PlanSpan = {
  id: "spring",
  starts_on: "2027-01-11",
  ends_on: "2027-05-07",
  status: "active",
};
const SUMMER: PlanSpan = {
  id: "summer",
  starts_on: "2026-05-11",
  ends_on: "2026-08-14",
  status: "closed",
};
const DRAFT: PlanSpan = {
  id: "draft",
  starts_on: "2027-05-10",
  ends_on: "2027-08-13",
  status: "draft",
};
const PLANS = [FALL, SPRING, SUMMER, DRAFT];

describe("planForDate", () => {
  it("finds the active plan containing the date, so a spring date is bookable while fall is current", () => {
    expect(planForDate(PLANS, "2026-10-07")?.id).toBe("fall");
    expect(planForDate(PLANS, "2027-02-01")?.id).toBe("spring");
  });
  it("includes the first and last day of a term", () => {
    expect(planForDate(PLANS, "2026-08-17")?.id).toBe("fall");
    expect(planForDate(PLANS, "2026-12-18")?.id).toBe("fall");
  });
  it("finds nothing in a gap between terms, or in a draft or closed plan", () => {
    expect(planForDate(PLANS, "2026-12-25")).toBeNull();
    expect(planForDate(PLANS, "2026-06-01")).toBeNull();
    expect(planForDate(PLANS, "2027-06-01")).toBeNull();
  });
});

describe("currentPlan", () => {
  it("is the active plan containing today", () => {
    expect(currentPlan(PLANS, "2026-10-07")?.id).toBe("fall");
  });
  it("is the next active plan to start when today is between terms", () => {
    expect(currentPlan(PLANS, "2026-12-25")?.id).toBe("spring");
  });
  it("is the active plan that ended most recently when none is ahead", () => {
    expect(currentPlan(PLANS, "2027-09-01")?.id).toBe("spring");
  });
  it("ignores draft and closed plans, and is null without an active one", () => {
    expect(currentPlan([SUMMER, DRAFT], "2026-06-01")).toBeNull();
    expect(currentPlan([], "2026-06-01")).toBeNull();
  });
  it("does not reorder the list it is given", () => {
    const list = [SPRING, FALL];
    currentPlan(list, "2030-01-01");
    expect(list.map((p) => p.id)).toEqual(["spring", "fall"]);
  });
});

describe("rangesOverlap", () => {
  it("counts a shared day, and not adjacent ranges", () => {
    expect(rangesOverlap(FALL, { starts_on: "2026-12-18", ends_on: "2027-01-02" })).toBe(true);
    expect(rangesOverlap(FALL, { starts_on: "2026-12-19", ends_on: "2027-01-02" })).toBe(false);
  });
});

describe("splitBlackoutAcrossPlans", () => {
  it("stores a winter break that spans two terms as one clipped row per term", () => {
    expect(
      splitBlackoutAcrossPlans({ starts_on: "2026-12-14", ends_on: "2027-01-15" }, PLANS),
    ).toEqual([
      { plan_id: "fall", starts_on: "2026-12-14", ends_on: "2026-12-18" },
      { plan_id: "spring", starts_on: "2027-01-11", ends_on: "2027-01-15" },
    ]);
  });
  it("keeps a blackout inside one term whole", () => {
    expect(
      splitBlackoutAcrossPlans({ starts_on: "2027-03-08", ends_on: "2027-03-12" }, PLANS),
    ).toEqual([{ plan_id: "spring", starts_on: "2027-03-08", ends_on: "2027-03-12" }]);
  });
  it("skips closed plans, which are final, and dates no plan covers", () => {
    expect(
      splitBlackoutAcrossPlans({ starts_on: "2026-06-01", ends_on: "2026-06-05" }, PLANS),
    ).toEqual([]);
    expect(
      splitBlackoutAcrossPlans({ starts_on: "2026-12-19", ends_on: "2027-01-10" }, PLANS),
    ).toEqual([]);
  });
  it("includes a draft plan, so a term being set up gets its blackouts", () => {
    expect(
      splitBlackoutAcrossPlans({ starts_on: "2027-05-05", ends_on: "2027-05-12" }, PLANS),
    ).toEqual([
      { plan_id: "spring", starts_on: "2027-05-05", ends_on: "2027-05-07" },
      { plan_id: "draft", starts_on: "2027-05-10", ends_on: "2027-05-12" },
    ]);
  });
});
