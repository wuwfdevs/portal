import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/cn";
import type { ForecastPeriodSummary } from "@/lib/log/weather-outlook";

/**
 * Renders the live-read text's Today/Tonight halves as visually distinct
 * blocks (a small label above each paragraph) instead of one run-on string —
 * requested directly after the initial "Today: ... Tonight: ..." inline fix
 * still read as a single paragraph. Falls back to the flat live_read_text
 * for a reading fetched before forecast_periods existed (default '[]').
 *
 * textClassName lets each caller match its own surrounding text size (the
 * sidebar's Full forecast disclosure runs text-xs throughout; the weather
 * page and a break's item card run text-sm) — the label stays a fixed
 * text-xs eyebrow either way, the same size used for every other label in
 * these screens.
 */
export function ForecastSummary({
  periods,
  fallbackText,
  textClassName = "text-sm",
}: {
  periods: ForecastPeriodSummary[];
  fallbackText: string;
  textClassName?: string;
}) {
  if (periods.length === 0) {
    return (
      <p className={cn("whitespace-pre-wrap leading-relaxed text-ink-700", textClassName)}>
        {fallbackText}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {periods.map((period) => (
        <div key={period.label}>
          <SectionHeading level="eyebrow" as="h3" className="mb-0.5">
            {period.label}
          </SectionHeading>
          <p className={cn("whitespace-pre-wrap leading-relaxed text-ink-700", textClassName)}>
            {period.text}
          </p>
        </div>
      ))}
    </div>
  );
}
