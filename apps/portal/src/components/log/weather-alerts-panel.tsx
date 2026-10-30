"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatStationTimestamp } from "@/lib/log/timezone";
import {
  alertPlaces,
  alertPreview,
  memberCountLabel,
  memberName,
  membersNeedingPreview,
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
 * Active NWS alerts, disclosed one level at a time so nothing long ever
 * stands between a host and the rest of the list:
 *
 *   closed   one row: the most severe alert, its counties, "+ N";
 *   open     the row becomes a title ("7 active alerts") and every alert is a
 *            compact row beneath it, the lead included, so no alert appears
 *            twice;
 *   alert    one alert selected opens in place; if NWS issued it as several
 *            (a warning per county, a flood warning per river) those are a
 *            short list of rows, and only one is read at a time.
 *
 * Same chip-then-text shape as the forecast strip, rendered under it on the
 * weather page and a weather item's card, and above the sidebar's collapsed
 * "Full forecast". Draws nothing when the check succeeded and nothing is
 * active; says so plainly when alerts have never been checked, rather than
 * implying all clear.
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
  /** The member read inside the selected alert; null means the first. "" means none. */
  const [memberId, setMemberId] = useState<string | null>(null);

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
  const small = textClassName === "text-xs";
  const padding = small ? "px-2.5" : "px-3";
  const staleNote =
    view.state === "stale" && view.checkedAt
      ? `Last checked ${formatStationTimestamp(view.checkedAt)}`
      : null;

  return (
    <div className="overflow-hidden rounded border border-line bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn("flex w-full items-start gap-2 py-2 text-left hover:bg-panel-50", padding)}
      >
        {open ? (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold text-ink-900">
              {alerts.length} active {alerts.length === 1 ? "alert" : "alerts"}
            </span>
            {staleNote && <span className="text-xs text-ink-500">{staleNote}</span>}
          </span>
        ) : (
          <AlertHeading
            alert={lead}
            extra={alerts.length > 1 ? `+ ${alerts.length - 1}` : null}
            note={staleNote}
          />
        )}
        <Chevron open={open} />
      </button>

      {open && (
        <ul>
          {alerts.map((alert) => {
            const selected = alert.id === selectedId;
            return (
              <li key={alert.id} className="border-t border-line">
                <button
                  type="button"
                  aria-expanded={selected}
                  onClick={() => {
                    setSelectedId(selected ? null : alert.id);
                    setMemberId(null);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 py-2 text-left hover:bg-panel-50",
                    padding,
                  )}
                >
                  <AlertHeading
                    alert={alert}
                    extra={memberCountLabel(alert)}
                    timing={alertTiming(alert, view.nowISO)}
                  />
                  <Chevron open={selected} />
                </button>
                {selected && (
                  <AlertDetail
                    alert={alert}
                    nowISO={view.nowISO}
                    textClassName={textClassName}
                    padding={padding}
                    memberId={memberId}
                    onMember={setMemberId}
                  />
                )}
              </li>
            );
          })}
        </ul>
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
 * The words under a selected alert. One alert: its text. An alert NWS issued
 * as several (a warning per county group, a flood warning per river): a short
 * list of rows, one per area, with only one open at a time — the first, until
 * a host picks another — so a long run of near-identical blocks never has to
 * be scrolled past.
 */
function AlertDetail({
  alert,
  nowISO,
  textClassName,
  padding,
  memberId,
  onMember,
}: {
  alert: WeatherAlert;
  nowISO: string;
  textClassName: string;
  padding: string;
  memberId: string | null;
  onMember: (id: string | null) => void;
}) {
  const members = alert.members;
  if (!members) {
    return (
      <div className={cn("border-t border-line bg-panel-50 py-2.5", padding)}>
        <AlertBody alert={alert} nowISO={nowISO} textClassName={textClassName} />
      </div>
    );
  }
  const activeId = memberId === null ? members[0]!.id : memberId;
  const needsPreview = membersNeedingPreview(members);
  return (
    <ul className="border-t border-line bg-panel-50">
      {members.map((member, index) => {
        const active = member.id === activeId;
        return (
          <li key={member.id} className={cn(index > 0 && "border-t border-line")}>
            <button
              type="button"
              aria-expanded={active}
              onClick={() => onMember(active ? "" : member.id)}
              className={cn(
                "flex w-full items-start gap-2 py-2 text-left hover:bg-panel-100",
                padding,
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-words text-xs font-semibold text-ink-900">
                  {memberName(member)}
                </span>
                <span className="break-words text-xs text-ink-500">
                  {alertTiming(member, nowISO)}
                </span>
                {needsPreview.has(member.id) && !active && (
                  <span className="break-words text-xs text-ink-700">{alertPreview(member)}</span>
                )}
              </span>
              <Chevron open={active} />
            </button>
            {active && (
              <div className={cn("pb-2.5", padding)}>
                <AlertBody alert={member} nowISO={nowISO} textClassName={textClassName} compact />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AlertBody({
  alert,
  nowISO,
  textClassName,
  compact = false,
}: {
  alert: WeatherAlert;
  nowISO: string;
  textClassName: string;
  /** Inside a member row, which already names the place and timing. */
  compact?: boolean;
}) {
  const full = alertFullText(alert);
  const leadText = alertLeadText(alert);
  const meta = (
    compact
      ? [alertIssuedLabel(alert), alert.senderName]
      : [alertPlaces(alert), alertIssuedLabel(alert), alert.senderName, alertTiming(alert, nowISO)]
  )
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-1.5">
      {meta && <p className="text-xs text-ink-400">{meta}</p>}
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
