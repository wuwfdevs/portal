import { describe, expect, it } from "vitest";
import { describeMakegoodState } from "./makegoods";

describe("describeMakegoodState", () => {
  it("is awaiting a slot once created but before one is chosen", () => {
    expect(describeMakegoodState({ status: "scheduled", scheduled_placement_id: null })).toBe("awaiting_slot");
  });

  it("is slot_scheduled once a placement is chosen but not yet aired", () => {
    expect(describeMakegoodState({ status: "scheduled", scheduled_placement_id: "placement-1" })).toBe(
      "slot_scheduled",
    );
  });

  it("is aired once its broadcast event confirms it, regardless of the placement id", () => {
    expect(describeMakegoodState({ status: "aired", scheduled_placement_id: "placement-1" })).toBe("aired");
    expect(describeMakegoodState({ status: "aired", scheduled_placement_id: null })).toBe("aired");
  });

  it("is cancelled once cancelled, regardless of whether a slot had been chosen", () => {
    expect(describeMakegoodState({ status: "cancelled", scheduled_placement_id: "placement-1" })).toBe("cancelled");
    expect(describeMakegoodState({ status: "cancelled", scheduled_placement_id: null })).toBe("cancelled");
  });
});
