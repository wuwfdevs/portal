"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { DailyOutlookEntry } from "@/lib/log/weather-outlook";
import { WeatherIcon } from "./weather-icon";

/**
 * The "at a glance" multi-day outlook — one compact chip per day (label,
 * icon, hi/lo). Shared by the rundown sidebar's Weather panel, a weather
 * item's own card, and the standalone /log/weather page so the three
 * surfaces can't drift apart on how this reads (the same reasoning
 * lib/underwriting/queries.ts's listObligationPlacementContexts() was
 * extracted for).
 *
 * Each day is a button: hovering previews, clicking (or Enter/Space) pins,
 * NWS's full forecast for it in a panel directly under the strip. The panel
 * deliberately sits under the strip rather than replacing the live-read
 * text above it — on a weather item's card that text is the on-air script
 * (and may be a host's edited override), which a hover must never hide.
 */
export function WeatherOutlookStrip({ days }: { days: DailyOutlookEntry[] }) {
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  if (days.length === 0) return null;

  const shownDate = hovered ?? pinned;
  const shown = days.find((day) => day.date === shownDate);
  const details = shown?.details ?? [];

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex gap-1 overflow-x-auto pb-0.5">
        {days.map((day) => {
          const hasDetails = (day.details?.length ?? 0) > 0;
          return (
            <li key={day.date} className="shrink-0">
              <button
                type="button"
                disabled={!hasDetails}
                aria-pressed={pinned === day.date}
                onClick={() => setPinned((current) => (current === day.date ? null : day.date))}
                onMouseEnter={() => setHovered(day.date)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded px-1.5 py-1 text-center",
                  hasDetails && "cursor-pointer hover:bg-panel-50",
                  shownDate === day.date && "bg-panel-50 ring-1 ring-line",
                )}
              >
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{day.day_label}</span>
                <WeatherIcon code={day.icon} className="h-6 w-6 text-ink-700" />
                <span className="font-mono text-xs font-semibold tabular-nums text-ink-900">
                  {day.high ?? "—"}°<span className="text-ink-400">/{day.low ?? "—"}°</span>
                </span>
                {day.precipitation_chance !== null && day.precipitation_chance > 0 && (
                  <span className="text-[10px] tabular-nums text-brand-link">{day.precipitation_chance}%</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {shown && details.length > 0 && (
        <div className="flex flex-col gap-2 rounded border border-line bg-panel-50 p-2.5" aria-live="polite">
          {details.map((period) => (
            <div key={period.label}>
              <div className="mb-0.5 text-xs font-bold uppercase tracking-wide text-ink-400">{period.label}</div>
              <p className="text-xs leading-relaxed text-ink-700">{period.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
