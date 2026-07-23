import { describe, expect, it } from "vitest";
import { isStalePitch } from "./staleness";

const now = new Date("2026-07-22T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("isStalePitch", () => {
  it("is fresh when recently submitted and never deferred", () => {
    expect(
      isStalePitch({ createdAt: daysAgo(5), lastReviewedAt: null, deferralCount: 0 }, now),
    ).toBe(false);
  });

  it("goes stale 90 days after submission with no review", () => {
    expect(
      isStalePitch({ createdAt: daysAgo(91), lastReviewedAt: null, deferralCount: 0 }, now),
    ).toBe(true);
  });

  it("a recent review resets the clock", () => {
    expect(
      isStalePitch({ createdAt: daysAgo(200), lastReviewedAt: daysAgo(10), deferralCount: 1 }, now),
    ).toBe(false);
  });

  it("three deferrals is stale regardless of recency", () => {
    expect(
      isStalePitch({ createdAt: daysAgo(20), lastReviewedAt: daysAgo(1), deferralCount: 3 }, now),
    ).toBe(true);
  });
});
