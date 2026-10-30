import { describe, expect, it } from "vitest";
import {
  buildClockViewSlots,
  clampHour,
  defaultSelectedSlotId,
  describeFloatNote,
  describePinScope,
  describeShiftHour,
  floatWindowFromSlot,
  formatOffsetRange,
  formatOffsetSeconds,
  makeFloatWindow,
  pinAppliesToHour,
  shiftInfoFromEntries,
  shiftTimeOfDay,
  slotDisplayLabel,
  slotVisualKind,
  type ClockSlotInput,
} from "./clock-view";

function slot(over: Partial<ClockSlotInput> & { id: string }): ClockSlotInput {
  return {
    position: 1,
    label: "Segment A",
    segment_label: null,
    timing_mode: "fixed",
    start_offset_seconds: 0,
    duration_seconds: 60,
    earliest_start_offset_seconds: null,
    latest_start_offset_seconds: null,
    ...over,
  };
}

describe("slotVisualKind", () => {
  const base = { segment_label: null, timing_mode: "fixed" as const };
  it("collapses the network's categories into four", () => {
    expect(slotVisualKind({ ...base, label: "Newscast 2" })).toBe("newscast");
    expect(slotVisualKind({ ...base, label: "Billboard" })).toBe("promo");
    expect(slotVisualKind({ ...base, label: "Music Bed" })).toBe("promo");
    expect(slotVisualKind({ ...base, label: "Funding Credit" })).toBe("promo");
    expect(slotVisualKind({ ...base, label: "Silence" })).toBe("silence");
    expect(slotVisualKind({ ...base, label: "Segment B" })).toBe("segment");
  });
});

describe("offset formatting", () => {
  it("formats minutes and seconds", () => {
    expect(formatOffsetSeconds(720)).toBe("12:00");
    expect(formatOffsetSeconds(750)).toBe("12:30");
    expect(formatOffsetRange(2640, 2820)).toBe("44:00–47:00");
    expect(formatOffsetRange(3000, 3000)).toBe("50:00");
  });
  it("labels an unlabeled slot by its segment letter", () => {
    expect(slotDisplayLabel({ label: null, segment_label: "B" })).toBe("Segment B");
    expect(slotDisplayLabel({ label: "  ", segment_label: null })).toBe("Slot");
  });
});

describe("floating windows", () => {
  it("derives both edges from a start window and a fixed length", () => {
    const window = floatWindowFromSlot(
      slot({
        id: "f",
        timing_mode: "float",
        start_offset_seconds: 2760,
        duration_seconds: 180,
        earliest_start_offset_seconds: 2640,
        latest_start_offset_seconds: 2820,
      }),
    );
    expect(window).toMatchObject({
      startEarliest: 2640,
      startLatest: 2820,
      endEarliest: 2820,
      endLatest: 3000,
      startMoves: true,
      endMoves: true,
      lengthMin: 0,
      lengthMax: 360,
    });
  });
  it("is null for a fixed slot or a float missing its bounds", () => {
    expect(floatWindowFromSlot(slot({ id: "a" }))).toBeNull();
    expect(floatWindowFromSlot(slot({ id: "b", timing_mode: "float" }))).toBeNull();
  });
  it("describes an interview that runs long: the start floats, the end is fixed", () => {
    const window = makeFloatWindow({
      startEarliest: 2640,
      startLatest: 2820,
      endEarliest: 3000,
      endLatest: 3000,
    });
    expect(window.startMoves).toBe(true);
    expect(window.endMoves).toBe(false);
    expect([window.lengthMin, window.lengthMax]).toEqual([180, 360]);
    expect(describeFloatNote(window)).toContain("always ends at 50:00");
    expect(describeFloatNote(window)).toContain("can run long");
  });
  it("describes the reverse and the fixed case", () => {
    const reverse = makeFloatWindow({
      startEarliest: 600,
      startLatest: 600,
      endEarliest: 660,
      endLatest: 720,
    });
    expect(describeFloatNote(reverse)).toContain("Always starts at 10:00");
    const fixed = makeFloatWindow({
      startEarliest: 600,
      startLatest: 600,
      endEarliest: 660,
      endLatest: 660,
    });
    expect(describeFloatNote(fixed)).toBe("Fixed from 10:00 to 11:00.");
  });
});

describe("pins by hour", () => {
  it("applies a null-hour pin to every hour and a scoped pin to its own", () => {
    expect(pinAppliesToHour({ hour_index: null }, 0)).toBe(true);
    expect(pinAppliesToHour({ hour_index: 1 }, 0)).toBe(false);
    expect(pinAppliesToHour({ hour_index: 1 }, 1)).toBe(true);
  });
  it("words the scope", () => {
    expect(describePinScope({ hour_index: null, days_of_week: [] })).toBe("Every day · every hour");
    expect(describePinScope({ hour_index: 1, days_of_week: [5] })).toBe(
      "Fri · hour 2 of the shift",
    );
  });
});

describe("buildClockViewSlots", () => {
  const slots = [
    slot({ id: "b", position: 2, label: "Music Bed", start_offset_seconds: 720 }),
    slot({
      id: "a",
      position: 1,
      label: "Billboard",
      start_offset_seconds: 0,
      duration_seconds: 120,
    }),
    slot({
      id: "f",
      position: 3,
      label: "Break",
      timing_mode: "float",
      start_offset_seconds: 2760,
      duration_seconds: 180,
      earliest_start_offset_seconds: 2640,
      latest_start_offset_seconds: 2820,
    }),
  ];
  const opportunities = [
    { id: "o1", slot_id: "b", requirement: "optional" as const },
    { id: "o2", slot_id: "f", requirement: "optional" as const },
  ];
  const pins = [
    { id: "p1", local_opportunity_id: "o1", hour_index: 1, days_of_week: [], title: "BirdNote" },
    { id: "p2", local_opportunity_id: "o1", hour_index: null, days_of_week: [], title: "Legal ID" },
  ];

  it("orders by start, floats by earliest start, and attaches local eligibility", () => {
    const view = buildClockViewSlots({ slots, opportunities, pins, hourIndex: 0 });
    expect(view.map((row) => row.id)).toEqual(["a", "b", "f"]);
    expect(view[1]?.local).toEqual({ opportunityId: "o1", requirement: "optional" });
    expect(view[2]?.float?.startMoves).toBe(true);
    expect(view[2]?.startSeconds).toBe(2640);
  });
  it("counts pins for the chosen hour and notes the ones elsewhere", () => {
    const first = buildClockViewSlots({ slots, opportunities, pins, hourIndex: 0 })[1];
    expect(first?.pinsThisHour.map((pin) => pin.title)).toEqual(["Legal ID"]);
    expect(first?.pinsOtherHours).toBe(1);
    const second = buildClockViewSlots({ slots, opportunities, pins, hourIndex: 1 })[1];
    expect(second?.pinsThisHour.map((pin) => pin.title)).toEqual(["BirdNote", "Legal ID"]);
    expect(second?.pinsOtherHours).toBe(0);
  });
  it("selects the first local slot by default", () => {
    const view = buildClockViewSlots({ slots, opportunities, pins, hourIndex: 0 });
    expect(defaultSelectedSlotId(view)).toBe("b");
    expect(defaultSelectedSlotId([])).toBeNull();
  });
});

describe("shift hours", () => {
  it("takes the longest entry's length and start", () => {
    expect(
      shiftInfoFromEntries([
        { air_time: "07:00:00", duration_minutes: 120 },
        { air_time: "09:00:00", duration_minutes: 60 },
      ]),
    ).toEqual({ hours: 2, startTime: "07:00:00" });
    expect(shiftInfoFromEntries([{ air_time: "13:00:00", duration_minutes: 90 }]).hours).toBe(2);
    expect(shiftInfoFromEntries([])).toEqual({ hours: 1, startTime: null });
  });
  it("turns an offset into a wall-clock time in the chosen hour", () => {
    expect(shiftTimeOfDay("07:00:00", 1, 720)).toBe("8:12 AM");
    expect(shiftTimeOfDay("23:30:00", 1, 0)).toBe("12:30 AM");
  });
  it("describes the hour, with times only when known", () => {
    expect(describeShiftHour({ hours: 2, startTime: "07:00:00" }, 1)).toBe(
      "Hour 2 of 2 · 8:00 AM – 9:00 AM",
    );
    expect(describeShiftHour({ hours: 3, startTime: null }, 0)).toBe("Hour 1 of 3");
  });
  it("clamps a requested hour into the shift", () => {
    expect(clampHour("1", 2)).toBe(1);
    expect(clampHour("5", 2)).toBe(1);
    expect(clampHour("-1", 2)).toBe(0);
    expect(clampHour("abc", 2)).toBe(0);
    expect(clampHour(undefined, 3)).toBe(0);
  });
});
