import { describe, expect, it } from "vitest";
import { computeFulfillment, type FulfillmentInput } from "./fulfillment";

function input(overrides: Partial<FulfillmentInput> = {}): FulfillmentInput {
  return {
    expectedOccurrences: 104,
    completedCount: 0,
    openExceptionCount: 0,
    openMakegoodCount: 0,
    ...overrides,
  };
}

describe("computeFulfillment", () => {
  it("is no_target when the contract has no fixed expected occurrence count", () => {
    const result = computeFulfillment(input({ expectedOccurrences: null }));
    expect(result.status).toBe("no_target");
    expect(result.remaining).toBeNull();
  });

  it("is on_track short of the target with nothing open", () => {
    const result = computeFulfillment(input({ completedCount: 40 }));
    expect(result.status).toBe("on_track");
    expect(result.remaining).toBe(64);
  });

  it("is fulfilled once completed meets the target with nothing open", () => {
    const result = computeFulfillment(input({ completedCount: 104 }));
    expect(result.status).toBe("fulfilled");
    expect(result.remaining).toBe(0);
  });

  it("stays behind, not fulfilled, when completed meets the target but an exception is still open", () => {
    const result = computeFulfillment(input({ completedCount: 104, openExceptionCount: 1 }));
    expect(result.status).toBe("behind");
  });

  it("stays behind when a makegood is still open, even short of the target", () => {
    const result = computeFulfillment(input({ completedCount: 50, openMakegoodCount: 1 }));
    expect(result.status).toBe("behind");
  });

  it("never lets remaining go negative", () => {
    const result = computeFulfillment(input({ completedCount: 110 }));
    expect(result.remaining).toBe(0);
  });
});
