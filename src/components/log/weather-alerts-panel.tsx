"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatStationTimestamp } from "@/lib/log/timezone";
import {
  alertFullText,
  alertsDisplay,
  alertIssuedLabel,
  alertLeadText,
  alertTiming,
  type AlertsCheckState,
  type AlertTier,
  type WeatherAlert,
} from "@/lib/log/weather-alerts";

const TIER_BADGE: Record<AlertTier, { variant: BadgeVariant; label: string }> = {
  warning: { variant: "danger", label: "Warning" },
  watch: { variant: "warning", label: "Watch" },
  statement: { variant: "neutral", label: "Statement" },
};

export interface WeatherAlertsView {
  alerts: WeatherAlert[];
  state: AlertsCheckState;
  /** Last successful check, ISO. */
  checkedAt: string | null;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("ml-auto shrink-0 text-ink-400 transition-transform", open && "rotate-90")}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * Active NWS alerts as one quiet row that opens in place — resting shows only
 * the most severe alert's name and how many more; opening lists them all, with
 * the most severe already read out; any one expands to its words. Same shape
 * as the forecast strip's chip-then-paragraph disclosure, and rendered under
 * it on every screen that shows the strip (the weather page, a weather item's
 * card) and above the sidebar's collapsed "Full forecast". Draws nothing when
 * the check succeeded and nothing is active; says so plainly when alerts have
 * never been checked, rather than implying all clear.
 */
export function WeatherAlertsPanel({
  view,
  textClassName = "text-sm",
}: {
  view: WeatherAlertsView;
  textClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const display = alertsDisplay(view.alerts, view.state);
  if (display === "hidden") return null;
  if (display === "unverified") {
    return (
      <Alert variant="warning">
        Couldn&apos;t check weather alerts
        {view.checkedAt
          ? ` (the last check, ${formatStationTimestamp(view.checkedAt)}, found none)`
          : ""}
        . Verify with the National Weather Service before airing a weather read.
      </Alert>
    );
  }

  const { alerts } = view;
  const lead = alerts[0]!;
  const more = alerts.length - 1;
  const activeId = selectedId ?? lead.id;
  const small = textClassName === "text-xs";

  return (
    <div className="overflow-hidden rounded border border-line bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-2 text-left hover:bg-panel-50",
          small ? "px-2.5 py-2" : "px-3 py-2.5",
        )}
      >
        <Badge variant={TIER_BADGE[lead.tier].variant}>{TIER_BADGE[lead.tier].label}</Badge>
        <span className="min-w-0 truncate text-sm font-semibold text-ink-900">{lead.event}</span>
        {more > 0 && (
          <span className="shrink-0 text-xs text-ink-400">
            + {more}
            {small ? "" : " more"}
          </span>
        )}
        {view.state === "stale" && view.checkedAt && (
          <span className="shrink-0 text-xs text-warning-fg">
            Last checked {formatStationTimestamp(view.checkedAt)}
          </span>
        )}
        <Chevron open={open} />
      </button>

      {open && (
        <ul>
          {alerts.map((alert) => {
            const selected = alert.id === activeId;
            const full = alertFullText(alert);
            const leadText = alertLeadText(alert);
            const meta = [
              alert.areaDesc,
              alertIssuedLabel(alert),
              alert.senderName,
              alertTiming(alert),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={alert.id} className="border-t border-line">
                <button
                  type="button"
                  aria-expanded={selected}
                  onClick={() => setSelectedId(selected ? "" : alert.id)}
                  className={cn(
                    "flex w-full items-center gap-2 text-left hover:bg-panel-50",
                    small ? "px-2.5 py-2" : "px-3 py-2",
                  )}
                >
                  <Badge variant={TIER_BADGE[alert.tier].variant}>
                    {TIER_BADGE[alert.tier].label}
                  </Badge>
                  <span className="min-w-0 truncate text-sm font-semibold text-ink-900">
                    {alert.event}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-ink-400">
                    {alertTiming(alert)}
                  </span>
                </button>
                {selected && (
                  <div
                    className={cn(
                      "flex flex-col gap-1.5 bg-panel-50 px-3 py-2.5",
                      small && "px-2.5",
                    )}
                  >
                    <p className="text-xs text-ink-400">{meta}</p>
                    {leadText && (
                      <p
                        className={cn(
                          "whitespace-pre-wrap leading-relaxed text-ink-700",
                          textClassName,
                        )}
                      >
                        {leadText}
                      </p>
                    )}
                    {full && (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                          Full NWS text
                        </summary>
                        <p
                          className={cn(
                            "mt-1.5 whitespace-pre-wrap leading-relaxed text-ink-700",
                            textClassName,
                          )}
                        >
                          {full}
                        </p>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
