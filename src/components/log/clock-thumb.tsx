import {
  buildClockFaceSegments,
  categorizeSlot,
  CATEGORY_COLOR,
  slotRenderWindow,
} from "@/lib/log/clock-face";
import type { LogClockSlotRow } from "@/lib/log/queries";

const CENTER = 50;
const R_OUTER = 46;
const R_INNER = 26;

/**
 * A small version of the clock ring for list rows and schedule entries: the
 * network slots only, colored by the same categories as the full diagram
 * (`ClockFace`), so a producer can tell clocks apart at a glance without
 * opening each one. The placeholder clock — one slot spanning the whole hour —
 * draws as a dashed ring instead, so "no real clock yet" reads differently
 * from "a clock with one long segment". Server-rendered, no interactivity.
 */
export function ClockThumb({
  slots,
  placeholder = false,
  size = 34,
  label,
}: {
  slots: LogClockSlotRow[];
  placeholder?: boolean;
  size?: number;
  label: string;
}) {
  const segments = placeholder
    ? []
    : buildClockFaceSegments(
        slots,
        3600,
        categorizeSlot,
        slotRenderWindow,
        CENTER,
        CENTER,
        R_OUTER,
        R_INNER,
      );
  const middle = (R_OUTER + R_INNER) / 2;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      {placeholder || segments.length === 0 ? (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={middle}
          fill="none"
          stroke="#C9CED4"
          strokeWidth={R_OUTER - R_INNER}
          strokeDasharray="3 3"
        />
      ) : (
        segments.map((segment, index) => (
          <path
            key={index}
            d={segment.pathD}
            fill={CATEGORY_COLOR[segment.category].fill}
            stroke="#FFFFFF"
            strokeWidth={1}
          />
        ))
      )}
      <circle cx={CENTER} cy={CENTER} r={R_OUTER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
      <circle cx={CENTER} cy={CENTER} r={R_INNER} fill="none" stroke="#E2E5E9" strokeWidth={1} />
    </svg>
  );
}
