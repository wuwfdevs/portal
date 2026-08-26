import type { DailyOutlookEntry } from "@/lib/log/weather-outlook";
import { WeatherIcon } from "./weather-icon";

/**
 * The "at a glance" multi-day outlook — one compact chip per day (label,
 * icon, hi/lo), no paragraph text. Shared by the rundown sidebar's Weather
 * panel, a weather item's own card, and the standalone /log/weather page so
 * the three surfaces can't drift apart on how this reads (the same reasoning
 * lib/underwriting/queries.ts's listObligationPlacementContexts() was
 * extracted for). Deliberately separate from the live-read text those
 * surfaces also show — this is forward-looking context, not the on-air copy.
 */
export function WeatherOutlookStrip({ days }: { days: DailyOutlookEntry[] }) {
  if (days.length === 0) return null;

  return (
    <ul className="flex gap-3 overflow-x-auto pb-0.5">
      {days.map((day) => (
        <li key={day.date} className="flex shrink-0 flex-col items-center gap-0.5 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{day.day_label}</span>
          <WeatherIcon code={day.icon} className="h-6 w-6 text-ink-700" />
          <span className="font-mono text-xs font-semibold tabular-nums text-ink-900">
            {day.high ?? "—"}°<span className="text-ink-400">/{day.low ?? "—"}°</span>
          </span>
          {day.precipitation_chance !== null && day.precipitation_chance > 0 && (
            <span className="text-[10px] tabular-nums text-brand-link">{day.precipitation_chance}%</span>
          )}
        </li>
      ))}
    </ul>
  );
}
