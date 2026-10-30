import { describe, expect, it } from "vitest";
import { checkStaleness } from "./staleness";

describe("checkStaleness", () => {
  it("treats a never-fetched value (null) as stale", () => {
    const result = checkStaleness(null, 60_000, "2026-08-07T12:00:00.000Z");
    expect(result.isStale).toBe(true);
    expect(result.ageMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("is not stale when younger than the threshold", () => {
    const result = checkStaleness("2026-08-07T11:59:30.000Z", 60_000, "2026-08-07T12:00:00.000Z");
    expect(result.isStale).toBe(false);
    expect(result.ageMs).toBe(30_000);
  });

  it("is stale once it reaches the threshold exactly", () => {
    const result = checkStaleness("2026-08-07T11:59:00.000Z", 60_000, "2026-08-07T12:00:00.000Z");
    expect(result.isStale).toBe(true);
    expect(result.ageMs).toBe(60_000);
  });

  it("is stale once older than the threshold", () => {
    const result = checkStaleness("2026-08-07T11:00:00.000Z", 60_000, "2026-08-07T12:00:00.000Z");
    expect(result.isStale).toBe(true);
  });
});
