"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatHourLabel, type WeekBand } from "@/lib/log/week-layout";

/** Pixels per hour; a block's height is its minutes scaled by this. */
const HOUR_PX = 34;
const GUTTER_PX = 64;
const POPOVER_WIDTH = 270;
const POPOVER_GAP = 6;
const POPOVER_MAX_HEIGHT = 170;

export interface WeekBlock {
  /** Unique within the grid (an entry appears once per day it airs). */
  key: string;
  entryId: string;
  programId: string;
  programName: string;
  /** "7:00 – 9:00 AM" */
  timeText: string;
  /** "Saturdays" */
  daysText: string;
  clockName: string;
  isPlaceholder: boolean;
  topMinutes: number;
  heightMinutes: number;
  lane: number;
  laneCount: number;
}

export interface WeekDay {
  dateISO: string;
  /** "Mon" */
  name: string;
  /** Day of the month */
  num: number;
  blocks: WeekBlock[];
  /** Automated hours and hours closed to underwriting, drawn behind the programs (lib/log/week-layout.ts shadingBands). */
  bands: WeekBand[];
}

/** The two schedule overlays' looks — the same marks the Automation and Underwriting pages use. */
export const BAND_CLASS: Record<WeekBand["kind"], string> = {
  automated: "bg-[#DCE1E6]/60",
  closed: "bg-[repeating-linear-gradient(135deg,rgba(166,52,52,0.16)_0_4px,transparent_4px_9px)]",
};
const BAND_LABEL: Record<WeekBand["kind"], string> = {
  automated: "Automated",
  closed: "Closed to underwriting",
};

interface Selected {
  key: string;
  left: number;
  top: number;
}

/**
 * The Programs week grid: Monday–Sunday columns, an hour gutter, and one
 * button per airing. Behind the airings, each day's automated hours and hours
 * closed to underwriting are shaded, so the one grid shows what airs, who is
 * in the studio, and where credits may go (edited under Automation and
 * Underwriting). Selecting a block opens a small card beside it (edit the
 * schedule, open the program). The grid scrolls horizontally inside its own
 * frame at narrow widths instead of widening the page.
 */
export function WeekGrid({
  days,
  startHour,
  endHour,
  canEdit,
  todayISO,
}: {
  days: WeekDay[];
  startHour: number;
  endHour: number;
  canEdit: boolean;
  todayISO: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setSelected(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      // A click on a block is handled by the block's own onClick (it toggles).
      if (target instanceof Element && target.closest("[data-week-block]")) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onResize);
    };
  }, [selected, close]);

  const selectedKey = selected?.key ?? null;
  useEffect(() => {
    if (selectedKey) popoverRef.current?.focus();
  }, [selectedKey]);

  const hours: number[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) hours.push(hour);
  const bodyHeight = (endHour - startHour) * HOUR_PX;

  const selectedBlock = selected
    ? (days.flatMap((day) => day.blocks).find((block) => block.key === selected.key) ?? null)
    : null;

  const onBlockClick = (block: WeekBlock, button: HTMLButtonElement) => {
    if (selected?.key === block.key) {
      close(false);
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    triggerRef.current = button;
    const bodyRect = body.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    const rightSpace = bodyRect.right - rect.right;
    const left =
      rightSpace >= POPOVER_WIDTH + POPOVER_GAP
        ? rect.right - bodyRect.left + POPOVER_GAP
        : Math.max(0, rect.left - bodyRect.left - POPOVER_WIDTH - POPOVER_GAP);
    const top = Math.max(0, Math.min(rect.top - bodyRect.top, bodyHeight - POPOVER_MAX_HEIGHT));
    setSelected({ key: block.key, left, top });
  };

  return (
    <div className="overflow-x-auto rounded border border-line">
      <div className="min-w-[900px]">
        <div className="flex border-b border-line bg-panel-50">
          <div className="shrink-0" style={{ width: GUTTER_PX }} />
          {days.map((day) => {
            const isToday = day.dateISO === todayISO;
            return (
              <div
                key={day.dateISO}
                className={cn(
                  "min-w-0 flex-1 basis-0 border-l border-line px-2.5 py-2",
                  isToday && "bg-brand-surface",
                )}
                aria-current={isToday ? "date" : undefined}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
                  {day.name}
                </span>
                <span
                  className={cn(
                    "ml-1.5 text-[15px] font-bold",
                    isToday ? "text-brand-link" : "text-ink-900",
                  )}
                >
                  {day.num}
                </span>
                {isToday && <span className="ml-1 text-xs font-bold text-brand-link">Today</span>}
              </div>
            );
          })}
        </div>

        <div ref={bodyRef} className="relative flex">
          <div
            className="relative shrink-0"
            style={{ width: GUTTER_PX, height: bodyHeight }}
            aria-hidden="true"
          >
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-ink-500"
                style={{ top: (hour - startHour) * HOUR_PX }}
              >
                {formatHourLabel(hour)}
              </span>
            ))}
          </div>

          {days.map((day) => (
            <div
              key={day.dateISO}
              className={cn(
                "relative min-w-0 flex-1 basis-0 border-l border-line",
                day.dateISO === todayISO && "bg-brand-surface/20",
              )}
              style={{
                height: bodyHeight,
                backgroundImage: "linear-gradient(#EEF0F3 1px, transparent 1px)",
                backgroundSize: `100% ${HOUR_PX}px`,
              }}
            >
              {day.bands.map((band, index) => (
                <div
                  key={`${band.kind}-${index}`}
                  aria-hidden="true"
                  title={BAND_LABEL[band.kind]}
                  className={cn("pointer-events-none absolute inset-x-0", BAND_CLASS[band.kind])}
                  style={{
                    top: (band.topMinutes / 60) * HOUR_PX,
                    height: (band.heightMinutes / 60) * HOUR_PX,
                  }}
                />
              ))}
              {day.blocks.map((block) => {
                const isSelected = selected?.key === block.key;
                const widthPct = 100 / block.laneCount;
                return (
                  <button
                    key={block.key}
                    type="button"
                    data-week-block
                    aria-haspopup="dialog"
                    aria-expanded={isSelected}
                    aria-label={`${block.programName}, ${day.name} ${block.timeText}, clock ${block.clockName}`}
                    onClick={(event) => onBlockClick(block, event.currentTarget)}
                    className={cn(
                      "absolute box-border block overflow-hidden rounded-[3px] border px-2 py-1 text-left text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900",
                      block.isPlaceholder
                        ? "border-dashed border-warning-border bg-warning-bg"
                        : "border-brand-primary/60 bg-brand-surface",
                      isSelected && "ring-2 ring-ink-900",
                    )}
                    style={{
                      top: (block.topMinutes / 60) * HOUR_PX,
                      height: Math.max(14, (block.heightMinutes / 60) * HOUR_PX - 2),
                      left: `calc(${block.lane * widthPct}% + 3px)`,
                      width: `calc(${widthPct}% - 6px)`,
                    }}
                  >
                    <span className="block text-sm font-bold leading-tight">
                      {block.programName}
                    </span>
                    <span className="block text-xs text-ink-700">{block.timeText}</span>
                    <span
                      className={cn(
                        "mt-0.5 block text-xs font-semibold",
                        block.isPlaceholder ? "text-warning-fg" : "text-brand-link",
                      )}
                    >
                      {block.clockName}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          {selected && selectedBlock && (
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={selectedBlock.programName}
              tabIndex={-1}
              className="absolute z-10 focus:outline-none rounded-md border border-line bg-white px-4 py-3.5 shadow-lg"
              style={{ left: selected.left, top: selected.top, width: POPOVER_WIDTH }}
            >
              <div className="text-base font-bold text-ink-900">{selectedBlock.programName}</div>
              <div className="mt-1 text-[15px] tabular-nums text-ink-900">
                {selectedBlock.daysText} · {selectedBlock.timeText}
              </div>
              <div className="mt-0.5 text-[13px] text-ink-500">
                Clock: {selectedBlock.clockName}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {canEdit && (
                  <Link
                    href={`/log/programs/${selectedBlock.programId}/schedule/${selectedBlock.entryId}/edit`}
                    className="inline-flex h-9 items-center rounded bg-brand-link px-3.5 text-sm font-bold text-white hover:bg-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
                  >
                    Edit schedule
                  </Link>
                )}
                <Link
                  href={`/log/programs/${selectedBlock.programId}`}
                  className="inline-flex h-9 items-center rounded border border-brand-link px-3 text-sm font-bold text-brand-link hover:bg-brand-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
                >
                  Open program
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
