// Pure geometry and categorization for rendering a clock version as a
// circular diagram, matching the shape of the NPR network clocks this
// tool's seed data was transcribed from (see docs/log-design.md and
// 20260806150000_log_seed_npr_clocks.sql). No "server-only" — this is
// plain math and string-building, safe to unit test directly and to import
// from the (server) page component that renders the SVG.

import type { LogSlotFillMode, LogSlotTimingMode } from "@/lib/database.types";

export type ClockFaceCategory =
  | "segment"
  | "newscast"
  | "promo"
  | "music"
  | "credit"
  | "float"
  | "optional";

export const CATEGORY_LABEL: Record<ClockFaceCategory, string> = {
  segment: "Segment (program content)",
  newscast: "Newscast / headlines",
  promo: "Promo / billboard",
  music: "Music bed",
  credit: "Funding credit",
  float: "Floating local break",
  optional: "Optional (host discretion)",
};

export const CATEGORY_COLOR: Record<ClockFaceCategory, { fill: string; stroke: string }> = {
  segment: { fill: "#ECEFF2", stroke: "#E2E5E9" },
  newscast: { fill: "#0F1419", stroke: "#0F1419" },
  promo: { fill: "#3090D0", stroke: "#3090D0" },
  music: { fill: "#6B9B96", stroke: "#6B9B96" },
  credit: { fill: "#D63E2D", stroke: "#D63E2D" },
  float: { fill: "#E3A63D", stroke: "#8A5A12" },
  optional: { fill: "#C7CBD1", stroke: "#8A9099" },
};

export interface ClockFaceSlotLike {
  label: string | null;
  segment_label: string | null;
  fill_mode: LogSlotFillMode;
  timing_mode: LogSlotTimingMode;
}

/**
 * Which visual category a slot falls into. Keyed off the label text this
 * repo's own seed data uses (Billboard/Newscast/Promo/Music Bed/Funding
 * Credit) plus timing_mode/fill_mode for the local-avail cases, since there
 * is no dedicated column for "kind of network element" — see the seed
 * migration's file header for why that's a reasonable simplification.
 */
export function categorizeSlot(slot: ClockFaceSlotLike): ClockFaceCategory {
  if (slot.timing_mode === "float") return "float";
  if (slot.fill_mode === "optional") return "optional";

  const label = slot.label ?? "";
  if (/billboard|promo/i.test(label)) return "promo";
  if (/newscast|headlines|return/i.test(label)) return "newscast";
  if (/funding credit/i.test(label)) return "credit";
  if (/music/i.test(label)) return "music";
  if (slot.segment_label) return "segment";
  return "segment";
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

/**
 * Lays out every slot as a ring segment around a face representing
 * totalDurationSeconds (typically 3600 — a full hour), in the slots'
 * existing order. Slots are expected non-overlapping and given in
 * chronological order (true of every seeded clock — the "float"/"optional"
 * slots that do overlap their surrounding segment are deliberately excluded
 * from the main ring by the caller and rendered as an inner-ring overlay
 * instead; see clock-face.tsx).
 */
export function buildClockFaceSegments<T extends { start_offset_seconds: number | null; duration_seconds: number }>(
  slots: T[],
  totalDurationSeconds: number,
  categorize: (slot: T) => ClockFaceCategory,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
): ClockFaceSegment<T>[] {
  const segments: ClockFaceSegment<T>[] = [];
  for (const slot of slots) {
    const start = slot.start_offset_seconds ?? 0;
    const startAngle = (start / totalDurationSeconds) * 360;
    const sweep = (slot.duration_seconds / totalDurationSeconds) * 360;
    const pathD = describeRingSegment(cx, cy, rOuter, rInner, startAngle, sweep);
    if (pathD) segments.push({ slot, category: categorize(slot), pathD });
  }
  return segments;
}
