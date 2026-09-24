import { describe, expect, it } from "vitest";
import {
  alignBreaksToClock,
  type AlignmentOpportunity,
  type AlignmentSlot,
} from "@/lib/log/program-log-clock-alignment";
import { clockTimeToSeconds, type BreakPlan, type ItemPlan } from "@/lib/log/program-log-plan";

let slotCounter = 0;
function slot(label: string, start: number, duration: number): AlignmentSlot {
  slotCounter += 1;
  return {
    id: `slot-${label}-${start}`,
    position: slotCounter,
    label,
    timing_mode: "fixed",
    start_offset_seconds: start,
    duration_seconds: duration,
    earliest_start_offset_seconds: null,
    latest_start_offset_seconds: null,
  };
}

function floatSlot(
  label: string,
  earliest: number,
  latest: number,
  duration: number,
): AlignmentSlot {
  return {
    ...slot(label, earliest, duration),
    timing_mode: "float",
    earliest_start_offset_seconds: earliest,
    latest_start_offset_seconds: latest,
  };
}

function opportunityFor(target: AlignmentSlot, types = ["psa"]): AlignmentOpportunity {
  return {
    id: `opp-${target.id}`,
    slot_id: target.id,
    requirement: "optional",
    permitted_content_types: types,
  };
}

const credit = (title: string): ItemPlan => ({
  kind: "credit",
  copyKey: `new:${title}`,
  title,
  durationSeconds: 30,
});

function exportBreak(
  time: string,
  window: number,
  items: ItemPlan[],
  label = "Underwriting break",
): BreakPlan {
  return {
    startSeconds: clockTimeToSeconds(time),
    time,
    label,
    availableDurationSeconds: window,
    items,
  };
}

// A slice of Morning Edition's real clock: 5:00 AM shift, two hours.
const musicBed360 = slot("Music Bed", 360, 90);
const segmentA = slot("Segment A", 450, 690);
const musicBed1140 = slot("Music Bed", 1140, 90);
const faPromo = slot("FA Promo", 1230, 30);
const musicBed2550 = slot("Music Bed", 2550, 90);
const musicBed2974 = slot("Music Bed", 2974, 115);
const segmentE = slot("Segment E", 3089, 450);
const meSlots = [
  musicBed360,
  segmentA,
  musicBed1140,
  faPromo,
  musicBed2550,
  musicBed2974,
  segmentE,
];
const ME_START = clockTimeToSeconds("05:00:00");

function align(
  exportBreaks: BreakPlan[],
  opportunities: AlignmentOpportunity[] = [],
  slots = meSlots,
  shiftDurationMinutes = 120,
) {
  return alignBreaksToClock({
    exportBreaks,
    shiftStartSeconds: ME_START,
    shiftDurationMinutes,
    slots,
    opportunities,
  }).breaks;
}

describe("alignBreaksToClock", () => {
  it("creates every marked opportunity's break, filled or not, at the clock's times", () => {
    const breaks = align([], [opportunityFor(musicBed1140)]);
    expect(
      breaks.map((brk) => [brk.time, brk.availableDurationSeconds, brk.placement?.source]),
    ).toEqual([
      ["05:19:00", 90, "opportunity"],
      ["06:19:00", 90, "opportunity"],
    ]);
    expect(breaks[1]!.placement).toMatchObject({
      hourIndex: 1,
      clockSlotId: musicBed1140.id,
      localOpportunityId: `opp-${musicBed1140.id}`,
      landingOffsetSeconds: null,
    });
  });

  it("puts an export break into the marked opportunity it starts at, a second or two off", () => {
    const breaks = align(
      [exportBreak("05:19:01", 90, [credit("A"), credit("B")])],
      [opportunityFor(musicBed1140)],
    );
    const filled = breaks.find((brk) => brk.items.length > 0)!;
    expect(filled.time).toBe("05:19:00");
    expect(filled.placement?.source).toBe("opportunity");
    expect(filled.items.map((item) => item.title)).toEqual(["A", "B"]);
    expect(filled.placement?.exportTimes).toEqual(["05:19:01"]);
    // A credit landed there, so this airing's break permits one — the export prevails.
    expect(filled.placement?.permittedContentTypes).toEqual(["psa", "underwriting_credit"]);
  });

  it("places a credit in an unmarked slot using the slot's clock window, not DAD's", () => {
    const [brk] = align([exportBreak("05:49:35", 90, [credit("A")])]);
    expect(brk).toMatchObject({
      time: "05:49:34",
      label: "Music Bed",
      availableDurationSeconds: 115,
      placement: {
        source: "clock_slot",
        clockSlotId: musicBed2974.id,
        localOpportunityId: null,
        hourIndex: 0,
      },
    });
  });

  it("puts a DAD avail that spans several slots in the first slot's break, on that slot's window", () => {
    // 1A: an 18:30 avail printed with a 90s window over a 30s music bed and
    // a 60s promo. The break is the music bed's; the timing engine carries
    // the overrun into the promo's break if it has one, or reports it.
    const bed = slot("Music Bed", 1110, 30);
    const promo = slot("Vertical Promo", 1140, 60);
    const breaks = align([exportBreak("05:18:30", 90, [credit("A")])], [], [bed, promo]);
    expect(breaks.map((brk) => [brk.time, brk.label, brk.availableDurationSeconds])).toEqual([
      ["05:18:30", "Music Bed", 30],
    ]);
  });

  it("joins a later export row that starts inside an unmarked slot another row opened", () => {
    // A credit at 42:30 and BirdNote printed 30s later, both inside one 90s music bed.
    const breaks = align([
      exportBreak("05:42:30", 30, [credit("A")]),
      exportBreak("05:43:00", 30, [credit("BirdNote")], "BirdNote"),
    ]);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ time: "05:42:30", availableDurationSeconds: 90 });
    expect(breaks[0]!.items.map((item) => item.title)).toEqual(["A", "BirdNote"]);
  });

  it("places an export break inside a floating slot's window at the export's time", () => {
    const float = floatSlot("Floating Break 1", 1020, 1380, 60);
    const [brk] = align([exportBreak("05:19:30", 60, [credit("A")])], [], [float]);
    expect(brk).toMatchObject({
      time: "05:19:30",
      label: "Floating Break 1",
      availableDurationSeconds: 60,
      // The landing is the one per-day time a break carries; the rejoin is
      // the float's latest start plus its duration, as generation does.
      placement: { source: "clock_slot", landingOffsetSeconds: 1170, rejoinOffsetSeconds: 1440 },
    });
  });

  it("uses a marked floating opportunity's own break when the export lands in its window", () => {
    const float = floatSlot("Floating Break 1", 1020, 1380, 60);
    const breaks = align(
      [exportBreak("05:19:30", 60, [credit("A")])],
      [opportunityFor(float)],
      [float],
      60,
    );
    expect(breaks).toHaveLength(1);
    expect(breaks[0]!.placement?.source).toBe("opportunity");
    expect(breaks[0]!.items).toHaveLength(1);
  });

  it("reports a row as unresolved where the clock has no avail-sized slot, and creates no break", () => {
    // BBC's clock: a 30s avail printed at the start of a 23-minute segment.
    const segment = slot("Segment A", 360, 1380);
    const result = alignBreaksToClock({
      exportBreaks: [exportBreak("05:06:00", 30, [credit("A")], "UW Credit")],
      shiftStartSeconds: ME_START,
      shiftDurationMinutes: 60,
      slots: [segment],
      opportunities: [],
    });
    expect(result.breaks).toEqual([]);
    expect(result.unresolved).toEqual([
      expect.objectContaining({ time: "05:06:00", description: "A" }),
    ]);
  });

  it("creates nothing for an empty export avail", () => {
    expect(align([exportBreak("05:06:00", 90, [])])).toEqual([]);
  });

  it("returns breaks in air order across hours", () => {
    const breaks = align(
      [exportBreak("06:06:00", 90, [credit("B")]), exportBreak("05:06:00", 90, [credit("A")])],
      [opportunityFor(musicBed1140)],
    );
    expect(breaks.map((brk) => brk.time)).toEqual(["05:06:00", "05:19:00", "06:06:00", "06:19:00"]);
  });
});
