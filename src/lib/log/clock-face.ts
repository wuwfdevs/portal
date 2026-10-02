// Pure geometry and categorization for rendering a clock version as a
// circular diagram, matching the shape of the NPR network clocks this
// tool's seed data was transcribed from (see docs/log-design.md and
// 20260806150000_log_seed_npr_clocks.sql). No "server-only" — this is
// plain math and string-building, safe to unit test directly and to import
// from the (server) page component that renders the SVG.

import type { LogOpportunityRequirement, LogSlotTimingMode } from "@/lib/database.types";

export type ClockFaceCategory =
  | "segment"
  | "newscast"
  | "promo"
  | "music"
  | "credit"
  | "float"
  | "local_optional"
  | "local_required";

export const CATEGORY_LABEL: Record<ClockFaceCategory, string> = {
  segment: "Segment (program content)",
  newscast: "Newscast / headlines",
  promo: "Promo / billboard",
  music: "Music bed",
  credit: "Funding credit",
  float: "Floating network element",
  local_optional: "WUWF local opportunity (optional)",
  local_required: "WUWF local opportunity (required)",
};

export const CATEGORY_COLOR: Record<ClockFaceCategory, { fill: string; stroke: string }> = {
  segment: { fill: "#ECEFF2", stroke: "#E2E5E9" },
  newscast: { fill: "#0F1419", stroke: "#0F1419" },
  promo: { fill: "#3090D0", stroke: "#3090D0" },
  music: { fill: "#6B9B96", stroke: "#6B9B96" },
  credit: { fill: "#D63E2D", stroke: "#D63E2D" },
  float: { fill: "#E3A63D", stroke: "#8A5A12" },
  local_optional: { fill: "#8B6BC7", stroke: "#5B3F94" },
  local_required: { fill: "#C74B6B", stroke: "#8A2E45" },
};

export interface ClockFaceSlotLike {
  label: string | null;
  segment_label: string | null;
  timing_mode: LogSlotTimingMode;
}

/**
 * Which visual category a network clock slot falls into. Keyed off the
 * label text this repo's own seed data uses (Billboard/Newscast/Promo/Music
 * Bed/Funding Credit) plus timing_mode for a genuinely floating *network*
 * element (e.g. Hidden Brain's own described break — still a fact about the
 * network clock, distinct from a WUWF local opportunity, which is a
 * separate overlay — see categorizeOpportunity below and
 * docs/log-design.md §4A/§4B). There is no dedicated column for "kind of
 * network element," so this stays a label-text heuristic — see the seed
 * migration's file header for why that's a reasonable simplification.
 */
export function categorizeSlot(slot: ClockFaceSlotLike): ClockFaceCategory {
  if (slot.timing_mode === "float") return "float";

  const label = slot.label ?? "";
  if (/billboard|promo/i.test(label)) return "promo";
  if (/newscast|headlines|return/i.test(label)) return "newscast";
  if (/funding credit/i.test(label)) return "credit";
  if (/music/i.test(label)) return "music";
  if (slot.segment_label) return "segment";
  return "segment";
}

export interface ClockFaceOpportunityLike {
  requirement: LogOpportunityRequirement;
}

/** WUWF's local-opportunity overlay renders as its own outer ring, distinct from the network clock — see docs/log-design.md §4A/§4B. */
export function categorizeOpportunity(opportunity: ClockFaceOpportunityLike): ClockFaceCategory {
  return opportunity.requirement === "required" ? "local_required" : "local_optional";
}

/** Point on a circle of radius r centered at (cx, cy), at angleDeg measured clockwise from the top (12 o'clock = 0). */
export function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

/**
 * SVG path `d` for a donut-segment (ring slice) between startAngleDeg and
 * startAngleDeg + sweepDeg, clockwise from the top. sweepDeg of 0 (or a
 * negative value) returns null — nothing to draw.
 */
export function describeRingSegment(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngleDeg: number,
  sweepDeg: number,
): string | null {
  if (sweepDeg <= 0) return null;
  // A full-circle sweep degenerates the arc flags below; clamp just under 360
  // so it still renders as (visually) a complete ring.
  const clampedSweep = Math.min(sweepDeg, 359.99);
  const endAngleDeg = startAngleDeg + clampedSweep;
  const largeArc = clampedSweep > 180 ? 1 : 0;

  const outerStart = pointOnCircle(cx, cy, rOuter, startAngleDeg);
  const outerEnd = pointOnCircle(cx, cy, rOuter, endAngleDeg);
  const innerEnd = pointOnCircle(cx, cy, rInner, endAngleDeg);
  const innerStart = pointOnCircle(cx, cy, rInner, startAngleDeg);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export interface ClockFaceSegment<T> {
  slot: T;
  category: ClockFaceCategory;
  pathD: string;
}

export interface ClockFaceWindow {
  start: number;
  duration: number;
}

export interface ClockFaceWindowLike {
  start_offset_seconds: number | null;
  duration_seconds: number;
  timing_mode: LogSlotTimingMode;
  earliest_start_offset_seconds: number | null;
  latest_start_offset_seconds: number | null;
}

/**
 * The offset/duration to actually render for a slot. A fixed slot renders at
 * its own start/duration, same as before. A float slot renders across its
 * full possible window — from the earliest it could start to the latest it
 * could end (latest start + its duration) — since "somewhere in this range"
 * is the honest picture, not the single nominal position seed data happens
 * to store in start_offset_seconds. Falls back to the fixed behavior if a
 * float slot is somehow missing its window bounds.
 */
export function slotRenderWindow(slot: ClockFaceWindowLike): ClockFaceWindow {
  if (
    slot.timing_mode === "float" &&
    slot.earliest_start_offset_seconds != null &&
    slot.latest_start_offset_seconds != null
  ) {
    const start = slot.earliest_start_offset_seconds;
    const end = slot.latest_start_offset_seconds + slot.duration_seconds;
    return { start, duration: end - start };
  }
  return { start: slot.start_offset_seconds ?? 0, duration: slot.duration_seconds };
}

/**
 * Lays out every slot as a ring segment around a face representing
 * totalDurationSeconds (typically 3600 — a full hour), in the slots'
 * existing order. Slots are expected non-overlapping and given in
 * chronological order (true of every seeded clock — the "float"/"optional"
 * slots that do overlap their surrounding segment are deliberately excluded
 * from the main ring by the caller and rendered as an inner-ring overlay
 * instead; see clock-face.tsx). `getWindow` decides each slot's rendered
 * offset/duration — pass `slotRenderWindow` to draw a float slot across its
 * full window rather than its single nominal position.
 */
export function buildClockFaceSegments<T>(
  slots: T[],
  totalDurationSeconds: number,
  categorize: (slot: T) => ClockFaceCategory,
  getWindow: (slot: T) => ClockFaceWindow,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
): ClockFaceSegment<T>[] {
  const segments: ClockFaceSegment<T>[] = [];
  for (const slot of slots) {
    const { start, duration } = getWindow(slot);
    const startAngle = (start / totalDurationSeconds) * 360;
    const sweep = (duration / totalDurationSeconds) * 360;
    const pathD = describeRingSegment(cx, cy, rOuter, rInner, startAngle, sweep);
    if (pathD) segments.push({ slot, category: categorize(slot), pathD });
  }
  return segments;
}

/** Formats an offset in seconds as a minute label ("20" or "20:30"), wrapping to within one lap of the face. */
export function formatOffsetLabel(seconds: number, totalDurationSeconds: number): string {
  const wrapped = ((seconds % totalDurationSeconds) + totalDurationSeconds) % totalDurationSeconds;
  const minutes = Math.floor(wrapped / 60);
  const remainderSeconds = Math.round(wrapped % 60);
  return remainderSeconds === 0 ? `${minutes}` : `${minutes}:${String(remainderSeconds).padStart(2, "0")}`;
}

export interface ClockFaceBoundaryLabel {
  x: number;
  y: number;
  angleDeg: number;
  text: string;
}

export interface RadialLabelOrientation {
  rotationDeg: number;
  anchor: "start" | "end";
}

/**
 * How to rotate and anchor a text label sitting at angleDeg on the ring so
 * it reads outward along its own radius — like the numerals around the
 * source NPR clock PDFs — rather than horizontally. Horizontal labels
 * overlap badly wherever two slot boundaries fall only a few seconds apart
 * (a short newscast next to a short music bed, say); a radial label's
 * footprint along the ring is just its line thickness, so tightly packed
 * boundaries no longer collide. Never rotates past ±90° from horizontal,
 * so the text itself never renders upside down.
 */
export function radialLabelOrientation(angleDeg: number): RadialLabelOrientation {
  const normalized = ((angleDeg % 360) + 360) % 360;
  let raw = normalized - 90;
  if (raw > 180) raw -= 360;
  if (raw < -180) raw += 360;
  if (raw > 90 || raw < -90) {
    return { rotationDeg: raw > 0 ? raw - 180 : raw + 180, anchor: "end" };
  }
  return { rotationDeg: raw, anchor: "start" };
}

/**
 * A minute-mark label at every slot boundary (start and end of each slot's
 * rendered window), the way the source NPR clock PDFs label each segment
 * transition around the ring rather than a fixed 5-minute grid. Offsets are
 * deduped and sorted, and 0 is always included even if no slot starts there.
 */
export function buildBoundaryLabels<T>(
  slots: T[],
  totalDurationSeconds: number,
  getWindow: (slot: T) => ClockFaceWindow,
  cx: number,
  cy: number,
  radius: number,
): ClockFaceBoundaryLabel[] {
  const offsets = new Set<number>([0]);
  for (const slot of slots) {
    const { start, duration } = getWindow(slot);
    const wrap = (value: number) => ((value % totalDurationSeconds) + totalDurationSeconds) % totalDurationSeconds;
    offsets.add(wrap(start));
    offsets.add(wrap(start + duration));
  }

  return Array.from(offsets)
    .sort((a, b) => a - b)
    .map((offset) => {
      const angleDeg = (offset / totalDurationSeconds) * 360;
      const { x, y } = pointOnCircle(cx, cy, radius, angleDeg);
      return { x, y, angleDeg, text: formatOffsetLabel(offset, totalDurationSeconds) };
    });
}
