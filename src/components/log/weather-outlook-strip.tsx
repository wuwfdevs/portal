"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/cn";
import type { DailyOutlookEntry, ForecastPeriodSummary } from "@/lib/log/weather-outlook";
import { ForecastSummary } from "./forecast-summary";
import { WeatherAlertsPanel, type WeatherAlertsView } from "./weather-alerts-panel";
import { WeatherIcon } from "./weather-icon";

/** What Today's paragraph shows: the live read, and — on a weather item — a host's edit of it for this airing. */
export interface WeatherLiveRead {
  /** NWS's own today/tonight halves, shown when nothing has been edited. */
  periods: ForecastPeriodSummary[];
  /** Flat text for a reading fetched before periods existed, or the edited script. */
  fallbackText: string;
  /** Set when a host edited the script for this airing — shown instead of the NWS periods. */
  overrideText?: string | null;
  /** True on a weather item's card, where Today is the copy that airs; false where it is reference only. */
  onAir?: boolean;
}

/**
 * The multi-day forecast — one compact chip per day (label, icon, hi/lo), and
 * under it NWS's full forecast for the selected day. Shared by the rundown
 * sidebar's Weather panel, a weather item's own card, and the standalone
 * /log/sources/weather page so the three can't drift apart on how this reads.
 *
 * Today is selected on load and is the live read (the text a host airs, and
 * on a weather item the one a host can edit for this airing — that edit lives
 * in the card's ⋮ menu, not here). Clicking another day swaps the paragraph
 * for that day's NWS forecast, read-only. One paragraph area, not a live read
 * above and a second details panel below that repeat each other.
 */
export function WeatherOutlookStrip({
  days,
  liveRead,
  textClassName = "text-sm",
  alerts,
}: {
  days: DailyOutlookEntry[];
  liveRead: WeatherLiveRead;
  textClassName?: string;
  /** Active alerts, shown under the strip. The sidebar omits this and renders the panel itself, above its collapsed "Full forecast". */
  alerts?: WeatherAlertsView;
}) {
  const [selected, setSelected] = useState(0);
  if (days.length === 0) {
    return (
      <div className="flex flex-col gap-2.5">
        <ForecastSummary
          periods={liveRead.periods}
          fallbackText={liveRead.fallbackText}
          textClassName={textClassName}
        />
        {alerts && <WeatherAlertsPanel view={alerts} textClassName={textClassName} />}
      </div>
    );
  }

  const selectedDay = days[Math.min(selected, days.length - 1)]!;
  const isToday = selected === 0;
  const details = selectedDay.details ?? [];

  return (
    <div className="flex flex-col gap-2.5">
      <ul className="grid grid-cols-5 gap-1">
        {days.map((day, index) => {
          const hasDetails = index === 0 || (day.details?.length ?? 0) > 0;
          return (
            <li key={day.date}>
              <button
                type="button"
                disabled={!hasDetails}
                aria-pressed={index === selected}
                aria-label={`${day.day_label}: ${day.short_forecast}`}
                onClick={() => setSelected(index)}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded border px-1 py-1.5 text-center disabled:cursor-not-allowed disabled:opacity-60",
                  index === selected
                    ? "border-brand-primary bg-brand-surface"
                    : "border-transparent hover:bg-panel-100",
                )}
              >
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
                  {day.day_label}
                </span>
                <WeatherIcon code={day.icon} className="h-6 w-6 text-ink-700" />
                <span className="font-mono text-xs font-semibold tabular-nums text-ink-900">
                  {day.high ?? "—"}°<span className="text-ink-400">/{day.low ?? "—"}°</span>
                </span>
                <span className="h-3 text-[10px] tabular-nums text-brand-link">
                  {day.precipitation_chance !== null && day.precipitation_chance > 0
                    ? `${day.precipitation_chance}%`
                    : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 border-t border-line pt-2.5" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-500">
            {isToday ? "Today" : selectedDay.day_label}
          </span>
          {isToday && liveRead.onAir && <Badge variant="accent">On-air copy</Badge>}
          {isToday && liveRead.overrideText && (
            <Badge variant="warning">Edited for this airing</Badge>
          )}
        </div>
        {isToday ? (
          liveRead.overrideText ? (
            <p className={cn("whitespace-pre-wrap leading-relaxed text-ink-700", textClassName)}>
              {liveRead.overrideText}
            </p>
          ) : (
            <ForecastSummary
              periods={liveRead.periods}
              fallbackText={liveRead.fallbackText}
              textClassName={textClassName}
            />
          )
        ) : (
          <>
            <p className="text-xs text-ink-400">
              Reference only. The live read covers today and tonight.
            </p>
            <div className="flex flex-col gap-2.5">
              {details.map((period) => (
                <div key={period.label}>
                  <SectionHeading level="eyebrow" as="h3" className="mb-0.5">
                    {period.label}
                  </SectionHeading>
                  <p className={cn("leading-relaxed text-ink-700", textClassName)}>{period.text}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {alerts && <WeatherAlertsPanel view={alerts} textClassName={textClassName} />}
    </div>
  );
}
