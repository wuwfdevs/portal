import { describeRingSegment, slotRenderWindow } from "@/lib/log/clock-face";
import { SLOT_VISUAL_COLORS, slotVisualKind } from "@/lib/log/clock-view";
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
  // Same four-colour palette as the clock page's diagram (SLOT_VISUAL_COLORS);
  // a floating slot draws as an ordinary segment across its window.
  const segments = placeholder
    ? []
    : slots.flatMap((slot) => {
        const window = slotRenderWindow(slot);
        const pathD = describeRingSegment(
          CENTER,
          CENTER,
          R_OUTER,
          R_INNER,
          (window.start / 3600) * 360,
          (window.duration / 3600) * 360,
        );
        return pathD
          ? [
              {
                pathD,
                kind: slot.timing_mode === "float" ? ("segment" as const) : slotVisualKind(slot),
              },
            ]
          : [];
      });
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
            fill={SLOT_VISUAL_COLORS[segment.kind].fill}
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
