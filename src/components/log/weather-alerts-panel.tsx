"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatStationTimestamp } from "@/lib/log/timezone";
import {
  alertPlaces,
  alertFullText,
  alertLabels,
  alertsDisplay,
  alertIssuedLabel,
  alertLeadText,
  alertTiming,
  type AlertsCheckState,
  type AlertTier,
  type WeatherAlert,
} from "@/lib/log/weather-alerts";

const TIER_VARIANT: Record<AlertTier, BadgeVariant> = {
  warning: "danger",
  watch: "warning",
  statement: "neutral",
};

export interface WeatherAlertsView {
  alerts: WeatherAlert[];
  state: AlertsCheckState;
  /** Last successful check, ISO. */
  checkedAt: string | null;
  /** The instant the server rendered at, so timing text ("begins…", "until…") is identical on both sides of hydration. */
  nowISO: string;
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
      className={cn("ml-auto mt-1 shrink-0 text-ink-400 transition-transform", open && "rotate-90")}
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
  const [lead, ...rest] = alerts as [WeatherAlert, ...WeatherAlert[]];
  const small = textClassName === "text-xs";
  const padding = small ? "px-2.5" : "px-3";

  return (
    <div className="overflow-hidden rounded border border-line bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn("flex w-full items-start gap-2 py-2 text-left hover:bg-panel-50", padding)}
      >
        <AlertHeading
          alert={lead}
          extra={rest.length > 0 ? `+ ${rest.length}` : null}
          note={
            view.state === "stale" && view.checkedAt
              ? `Last checked ${formatStationTimestamp(view.checkedAt)}`
              : null
          }
        />
        <Chevron open={open} />
      </button>

      {open && (
        <>
          {/* The header already names the lead alert, so it is not listed again:
              its words sit directly under the header and the rest follow. */}
          <AlertDetail
            alert={lead}
            nowISO={view.nowISO}
            textClassName={textClassName}
            className={padding}
          />
          {rest.length > 0 && (
            <ul>
              {rest.map((alert) => {
                const selected = alert.id === selectedId;
                return (
                  <li key={alert.id} className="border-t border-line">
                    <button
                      type="button"
                      aria-expanded={selected}
                      onClick={() => setSelectedId(selected ? null : alert.id)}
                      className={cn(
                        "flex w-full items-start gap-2 py-2 text-left hover:bg-panel-50",
                        padding,
                      )}
                    >
                      <AlertHeading
                        alert={alert}
                        extra={null}
                        timing={alertTiming(alert, view.nowISO)}
                      />
                    </button>
                    {selected && (
                      <AlertDetail
                        alert={alert}
                        nowISO={view.nowISO}
                        textClassName={textClassName}
                        className={padding}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Badge, name without the word the badge already says, and beneath it the
 * coverage counties (plus, in a list row, when it ends). Nothing here
 * truncates: in the narrow sidebar a long name or place list wraps instead of
 * ending in an ellipsis, since a host reads this at a glance mid-broadcast.
 */
function AlertHeading({
  alert,
  extra,
  timing,
  note,
}: {
  alert: WeatherAlert;
  extra: string | null;
  timing?: string;
  note?: string | null;
}) {
  const { badge, name } = alertLabels(alert);
  const sub = [alertPlaces(alert), timing, note].filter(Boolean).join(" · ");
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <Badge variant={TIER_VARIANT[alert.tier]}>{badge}</Badge>
        <span className="min-w-0 break-words text-sm font-semibold text-ink-900">{name}</span>
        {extra && <span className="shrink-0 text-xs text-ink-400">{extra}</span>}
      </span>
      {sub && <span className="break-words text-xs text-ink-500">{sub}</span>}
    </span>
  );
}

/**
 * The words under an alert. A consolidated row (several NWS alerts of one
 * event) shows each as its own block, labelled by where it applies, so a
 * county's own forecast, impacts, contacts or river are never merged away.
 */
function AlertDetail({
  alert,
  nowISO,
  textClassName,
  className,
}: {
  alert: WeatherAlert;
  nowISO: string;
  textClassName: string;
  className?: string;
}) {
  const members = alert.members;
  if (!members) {
    return (
      <div className={cn("border-t border-line bg-panel-50 py-2.5", className)}>
        <AlertBody alert={alert} nowISO={nowISO} textClassName={textClassName} />
      </div>
    );
  }
  return (
    <div className="border-t border-line bg-panel-50">
      {members.map((member, index) => (
        <div
          key={member.id}
          className={cn("py-2.5", className, index > 0 && "border-t border-line")}
        >
          <AlertBody
            alert={member}
            nowISO={nowISO}
            textClassName={textClassName}
            label={memberLabel(member, nowISO)}
          />
        </div>
      ))}
    </div>
  );
}

/** Where a member applies, and when: "Mobile (Mobile Coastal) · in effect". */
function memberLabel(member: WeatherAlert, nowISO: string): string {
  const places = alertPlaces(member);
  const zones =
    member.areaDesc && member.areaDesc.length <= 40 && member.areaDesc !== places
      ? ` (${member.areaDesc})`
      : "";
  return [
    `${places ?? member.areaDesc ?? "Area not stated"}${zones}`,
    alertTiming(member, nowISO),
  ].join(" · ");
}

function AlertBody({
  alert,
  nowISO,
  textClassName,
  label,
}: {
  alert: WeatherAlert;
  nowISO: string;
  textClassName: string;
  label?: string;
}) {
  const full = alertFullText(alert);
  const leadText = alertLeadText(alert);
  const meta = [
    alertPlaces(alert),
    alertIssuedLabel(alert),
    alert.senderName,
    alertTiming(alert, nowISO),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-1.5">
      {label ? <p className="text-xs font-semibold text-ink-900">{label}</p> : null}
      <p className="text-xs text-ink-400">
        {label ? [alertIssuedLabel(alert), alert.senderName].filter(Boolean).join(" · ") : meta}
      </p>
      {leadText && (
        <p className={cn("whitespace-pre-wrap leading-relaxed text-ink-700", textClassName)}>
          {leadText}
        </p>
      )}
      {full && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-brand-link">
            Full NWS text
          </summary>
          <p
            className={cn("mt-1.5 whitespace-pre-wrap leading-relaxed text-ink-700", textClassName)}
          >
            {full}
          </p>
        </details>
      )}
    </div>
  );
}
