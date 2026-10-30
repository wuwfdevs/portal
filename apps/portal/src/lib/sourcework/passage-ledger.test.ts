import { describe, expect, it } from "vitest";
import { PassageLedger } from "./passage-ledger";

describe("PassageLedger", () => {
  it("numbers places from 1 and gives the same place the same ref", () => {
    const ledger = new PassageLedger();
    const a = ledger.add({ sourceId: "s1", startMs: 0, endMs: 5000, page: null });
    const b = ledger.add({ sourceId: "s1", startMs: 6000, endMs: 9000, page: null });
    const again = ledger.add({ sourceId: "s1", startMs: 0, endMs: 5000, page: null });
    expect([a, b, again]).toEqual([1, 2, 1]);
    expect(ledger.size).toBe(2);
    expect(ledger.get(2)).toEqual({ sourceId: "s1", startMs: 6000, endMs: 9000, page: null });
  });

  it("knows nothing it was not shown", () => {
    expect(new PassageLedger().get(1)).toBeUndefined();
  });

  it("does not let a caller change a recorded place", () => {
    const ledger = new PassageLedger();
    const place = { sourceId: "s1", startMs: 0, endMs: 5000, page: null };
    ledger.add(place);
    place.startMs = 99;
    expect(ledger.get(1)!.startMs).toBe(0);
  });
});
