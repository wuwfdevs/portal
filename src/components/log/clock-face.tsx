import {
  buildBoundaryLabels,
  buildClockFaceSegments,
  categorizeSlot,
  radialLabelOrientation,
  slotRenderWindow,
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  type ClockFaceCategory,
} from "@/lib/log/clock-face";
import type { LogClockSlotRow } from "@/lib/log/queries";

// A circular diagram of one clock version's slots, in the same spirit as the
// NPR network clock PDFs this tool's seed data was transcribed from (see
// docs/log-design.md and 20260806150000_log_seed_npr_clocks.sql) — a ring
// segmented by slot, colored by category, with a minute label at every slot
// boundary the way the source PDFs label each segment transition (not a
// generic 5-minute grid). Rendered as a plain server-side SVG: no
// interactivity beyond each segment's native <title> tooltip, so no
// "use client" is needed. Slots are drawn in their existing (position) order
// — a slot whose window overlaps an earlier one (1A's fundraising cutaways,
// nested inside a larger segment) is drawn after it and so correctly
// notches into it visually, without needing a separate overlay ring.

const SIZE = 360;
const CENTER = SIZE / 2;
const R_OUTER = 140;
const R_INNER = 90;
const R_LABEL = R_OUTER + 18;
const TOTAL_SECONDS = 3600;

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
    slotRenderWindow,
    CENTER,
    CENTER,
    R_OUTER,
    R_INNER,
  );
  const boundaryLabels = buildBoundaryLabels(slots, TOTAL_SECONDS, slotRenderWindow, CENTER, CENTER, R_LABEL);
  const usedCategories = Array.from(new Set(segments.map((segment) => segment.category))) as ClockFaceCategory[];
  const floatPatternId = `log-clock-float-hatch-${slots[0]?.clock_version_id ?? "default"}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Clock version diagram"
        className="h-auto w-full max-w-[320px]"
      >
        <defs>
          <pattern
            id={floatPatternId}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill={CATEGORY_COLOR.float.fill} />
            <line x1={0} y1={0} x2={0} y2={6} stroke={CATEGORY_COLOR.float.stroke} strokeWidth={3} />
          </pattern>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={R_OUTER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={R_INNER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
        {segments.map((segment, index) => {
          const color = CATEGORY_COLOR[segment.category];
          const isFloat = segment.category === "float";
          const label = segment.slot.label ?? CATEGORY_LABEL[segment.category];
          const title = isFloat
            ? `${label} — floats between ${formatOffset(segment.slot.earliest_start_offset_seconds ?? 0)} and ${formatOffset(segment.slot.latest_start_offset_seconds ?? 0)}, lasts ${formatOffset(segment.slot.duration_seconds)}`
            : `${label} — starts ${formatOffset(segment.slot.start_offset_seconds ?? 0)}, lasts ${formatOffset(segment.slot.duration_seconds)}`;
          return (
            <path
              key={index}
              d={segment.pathD}
              fill={isFloat ? `url(#${floatPatternId})` : color.fill}
              stroke={isFloat ? color.stroke : "#ffffff"}
              strokeWidth={isFloat ? 1.25 : 0.75}
              strokeDasharray={isFloat ? "3 2" : undefined}
            >
              <title>{title}</title>
            </path>
          );
        })}
        {boundaryLabels.map((boundaryLabel, index) => {
          const { rotationDeg, anchor } = radialLabelOrientation(boundaryLabel.angleDeg);
          return (
            <text
              key={index}
              x={boundaryLabel.x}
              y={boundaryLabel.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={9.5}
              className="fill-ink-500"
              transform={`rotate(${rotationDeg} ${boundaryLabel.x} ${boundaryLabel.y})`}
            >
              {boundaryLabel.text}
            </text>
          );
        })}
        <text x={CENTER} y={CENTER + 4} textAnchor="middle" fontSize={11} className="fill-ink-400">
          60 min
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
        {usedCategories.map((category) => (
          <span key={category} className="flex items-center gap-1.5">
            <svg width={10} height={10} aria-hidden="true">
              <rect
                width={10}
                height={10}
                rx={2}
                fill={category === "float" ? `url(#${floatPatternId})` : CATEGORY_COLOR[category].fill}
                stroke={category === "float" ? CATEGORY_COLOR.float.stroke : "#C7CBD1"}
                strokeWidth={category === "float" ? 1 : 0.75}
                strokeDasharray={category === "float" ? "2 1" : undefined}
              />
            </svg>
            {CATEGORY_LABEL[category]}
          </span>
        ))}
      </div>
    </div>
  );
}
