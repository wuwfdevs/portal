import {
  buildBoundaryLabels,
  buildClockFaceSegments,
  categorizeOpportunity,
  categorizeSlot,
  radialLabelOrientation,
  slotRenderWindow,
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  type ClockFaceCategory,
} from "@/lib/log/clock-face";
import type { LogClockSlotRow, LogLocalOpportunityWithSlot } from "@/lib/log/queries";

// A circular diagram of one clock version, in the same spirit as the NPR
// network clock PDFs this tool's seed data was transcribed from (see
// docs/log-design.md and 20260806150000_log_seed_npr_clocks.sql) — an inner
// ring segmented by network slot, colored by category, and an outer ring
// showing WUWF's own local-opportunity overlay (see docs/log-design.md §4A/
// §4B and 20260808120000_log_local_opportunities.sql) — deliberately a
// separate ring, not a recolored network segment, so the network clock's
// own structure and WUWF's overlay on top of it both stay legible at once.
// A minute label sits at every network-slot boundary, the way the source
// PDFs label each segment transition (not a generic 5-minute grid).
// Rendered as a plain server-side SVG: no interactivity beyond each
// segment's native <title> tooltip, so no "use client" is needed.
//
// Sized materially larger than the tool's first pass (320px) per the
// domain redesign — this is specifically about the Clocks tab; the host
// rundown does not get an equivalent large clock-face visualization.

const SIZE = 640;
const CENTER = SIZE / 2;
const R_NETWORK_OUTER = 210;
const R_NETWORK_INNER = 130;
const R_OPPORTUNITY_OUTER = 260;
const R_OPPORTUNITY_INNER = 220;
const R_LABEL = R_OPPORTUNITY_OUTER + 24;
const TOTAL_SECONDS = 3600;

function formatOffset(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function ClockFace({
  slots,
  opportunities = [],
}: {
  slots: LogClockSlotRow[];
  opportunities?: LogLocalOpportunityWithSlot[];
}) {
  const networkSegments = buildClockFaceSegments(
    slots,
    TOTAL_SECONDS,
    categorizeSlot,
    slotRenderWindow,
    CENTER,
    CENTER,
    R_NETWORK_OUTER,
    R_NETWORK_INNER,
  );
  // An opportunity carries no offset/duration of its own — its ring segment
  // is always drawn from its referenced network slot's own window (see
  // CLAUDE.md's dated note), so a locally-eligible slot's outer-ring arc
  // always lines up exactly with its inner-ring network segment.
  const opportunitySegments = buildClockFaceSegments(
    opportunities,
    TOTAL_SECONDS,
    categorizeOpportunity,
    (opportunity) => slotRenderWindow(opportunity.slot),
    CENTER,
    CENTER,
    R_OPPORTUNITY_OUTER,
    R_OPPORTUNITY_INNER,
  );
  const boundaryLabels = buildBoundaryLabels(slots, TOTAL_SECONDS, slotRenderWindow, CENTER, CENTER, R_LABEL);
  const usedCategories = Array.from(
    new Set([...networkSegments, ...opportunitySegments].map((segment) => segment.category)),
  ) as ClockFaceCategory[];
  const floatPatternId = `log-clock-float-hatch-${slots[0]?.clock_version_id ?? "default"}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Clock version diagram: network structure (inner ring) and WUWF local opportunities (outer ring)"
        className="h-auto w-full max-w-[560px]"
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
        <circle cx={CENTER} cy={CENTER} r={R_NETWORK_OUTER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={R_NETWORK_INNER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={R_OPPORTUNITY_OUTER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
        {networkSegments.map((segment, index) => {
          const color = CATEGORY_COLOR[segment.category];
          const isFloat = segment.category === "float";
          const label = segment.slot.label ?? CATEGORY_LABEL[segment.category];
          const title = isFloat
            ? `${label} — floats between ${formatOffset(segment.slot.earliest_start_offset_seconds ?? 0)} and ${formatOffset(segment.slot.latest_start_offset_seconds ?? 0)}, lasts ${formatOffset(segment.slot.duration_seconds)}`
            : `${label} — starts ${formatOffset(segment.slot.start_offset_seconds ?? 0)}, lasts ${formatOffset(segment.slot.duration_seconds)}`;
          return (
            <path
              key={`network-${index}`}
              d={segment.pathD}
              fill={isFloat ? `url(#${floatPatternId})` : color.fill}
              stroke={isFloat ? color.stroke : "#ffffff"}
              strokeWidth={isFloat ? 1.5 : 1}
              strokeDasharray={isFloat ? "3 2" : undefined}
            >
              <title>{title}</title>
            </path>
          );
        })}
        {opportunitySegments.map((segment, index) => {
          const color = CATEGORY_COLOR[segment.category];
          const opportunity = segment.slot;
          const label = opportunity.slot.label ?? "Local opportunity";
          const title = `${label} (${opportunity.requirement}) — starts ${formatOffset(opportunity.slot.start_offset_seconds ?? 0)}, ${formatOffset(opportunity.slot.duration_seconds)} available${opportunity.slot.timing_mode === "float" ? ` (floats between ${formatOffset(opportunity.slot.earliest_start_offset_seconds ?? 0)} and ${formatOffset(opportunity.slot.latest_start_offset_seconds ?? 0)})` : ""}`;
          return (
            <path
              key={`opportunity-${index}`}
              d={segment.pathD}
              fill={color.fill}
              stroke={color.stroke}
              strokeWidth={1}
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
              fontSize={14}
              className="fill-ink-500"
              transform={`rotate(${rotationDeg} ${boundaryLabel.x} ${boundaryLabel.y})`}
            >
              {boundaryLabel.text}
            </text>
          );
        })}
        <text x={CENTER} y={CENTER + 6} textAnchor="middle" fontSize={16} className="fill-ink-400">
          60 min
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-ink-500">
        {usedCategories.map((category) => (
          <span key={category} className="flex items-center gap-1.5">
            <svg width={11} height={11} aria-hidden="true">
              <rect
                width={11}
                height={11}
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
