import {
  buildClockFaceSegments,
  categorizeSlot,
  pointOnCircle,
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  type ClockFaceCategory,
} from "@/lib/log/clock-face";
import type { LogClockSlotRow } from "@/lib/log/queries";

// A circular diagram of one clock version's slots, in the same spirit as the
// NPR network clock PDFs this tool's seed data was transcribed from (see
// docs/log-design.md and 20260806150000_log_seed_npr_clocks.sql) — a ring
// segmented by slot, colored by category, with minute ticks. Rendered as a
// plain server-side SVG: no interactivity beyond each segment's native
// <title> tooltip, so no "use client" is needed. Slots are drawn in their
// existing (position) order — a slot whose window overlaps an earlier one
// (1A's fundraising cutaways, nested inside a larger segment) is drawn after
// it and so correctly notches into it visually, without needing a separate
// overlay ring.

const SIZE = 320;
const CENTER = SIZE / 2;
const R_OUTER = 150;
const R_INNER = 95;
const TOTAL_SECONDS = 3600;
const TICK_INTERVAL_SECONDS = 5 * 60;

function formatOffset(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function ClockFace({ slots }: { slots: LogClockSlotRow[] }) {
  const segments = buildClockFaceSegments(
    slots,
    TOTAL_SECONDS,
    categorizeSlot,
    CENTER,
    CENTER,
    R_OUTER,
    R_INNER,
  );
  const usedCategories = Array.from(new Set(segments.map((segment) => segment.category))) as ClockFaceCategory[];
  const ticks = Array.from({ length: TOTAL_SECONDS / TICK_INTERVAL_SECONDS }, (_, i) => i * TICK_INTERVAL_SECONDS);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Clock version diagram">
        <circle cx={CENTER} cy={CENTER} r={R_OUTER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={R_INNER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
        {segments.map((segment, index) => {
          const color = CATEGORY_COLOR[segment.category];
          const label = segment.slot.label ?? CATEGORY_LABEL[segment.category];
          const start = formatOffset(segment.slot.start_offset_seconds ?? 0);
          const duration = formatOffset(segment.slot.duration_seconds);
          return (
            <path key={index} d={segment.pathD} fill={color.fill} stroke="#ffffff" strokeWidth={0.75}>
              <title>
                {label} — starts {start}, lasts {duration}
              </title>
            </path>
          );
        })}
        {ticks.map((offset) => {
          const angle = (offset / TOTAL_SECONDS) * 360;
          const inner = pointOnCircle(CENTER, CENTER, R_OUTER + 3, angle);
          const outer = pointOnCircle(CENTER, CENTER, R_OUTER + 11, angle);
          return (
            <line
              key={offset}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#8A9099"
              strokeWidth={1}
            />
          );
        })}
        <text x={CENTER} y={CENTER - R_OUTER - 18} textAnchor="middle" fontSize={11} className="fill-ink-500">
          0:00
        </text>
        <text x={CENTER} y={CENTER + 4} textAnchor="middle" fontSize={11} className="fill-ink-400">
          60 min
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
        {usedCategories.map((category) => (
          <span key={category} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLOR[category].fill }}
            />
            {CATEGORY_LABEL[category]}
          </span>
        ))}
      </div>
    </div>
  );
}
