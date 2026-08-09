import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  CONTENT_TYPE_LABEL,
  WEATHER_ITEM_SENTINEL,
  computeTotalDurationSeconds,
} from "@/lib/log/content-library";
import {
  getRundownDetail,
  listBroadcastEventsForItems,
  listContentItems,
  listLocalOpportunitiesForVersion,
  listUnderwritingCopyForItems,
  type RundownBreakDetail,
  type RundownItemDetail,
} from "@/lib/log/queries";
import {
  computeLiveTimingState,
  type ConsoleBreakLike,
  type LiveTimingState,
} from "@/lib/log/console-timing";
import { listValidMoveDestinations, type MoveDestinationBreakLike } from "@/lib/log/mid-broadcast";
import { filterEligibleContent } from "@/lib/log/rundown-eligibility";
import { buildRundownBreakDrafts, selectMissingBreakDrafts } from "@/lib/log/rundown-generation";
import { computeBreakFit, computeBreakStatus, computeRundownSummary } from "@/lib/log/timing";
import { listUnresolvedEntries } from "@/lib/log/submission";
import { getCurrentWeatherReading } from "@/lib/log/weather";
import { getNprEpisodeForProgramOnDate } from "@/lib/log/npr";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { LogPoller } from "../../log-poller";
import {
  markAired,
  markMissed,
  moveRundownItem,
  startBroadcast,
  submitRundown,
} from "../../broadcast-actions";
import {
  fillRundownItem,
  removeRundownItem,
  syncRundownBreaks,
  updateItemOverrides,
} from "../../rundown-actions";
import { CopyDisplay } from "./copy-display";
import { LiveReadForm, type NprLookaheadItem } from "./live-read-form";
import { RundownLiveLayout } from "./rundown-live-layout";
import type { LogContentType, LogMissReason, LogRundownStatus } from "@/lib/database.types";

// One screen, not two. Builder and console used to be separate routes —
// pre-air planning here, live execution there — on the assumption that
// "building" and "running" a broadcast are different moments a host moves
// between. They aren't, in practice: a solo host at a small station is
// routinely deciding what fills an open avail *while on air*, not only
// executing a plan someone finished building ahead of time, and the
// vertical, always-visible break list this screen is built around is
// exactly the view that gives a host control during a live broadcast, not
// something that has to be narrowed away in favor of a minimal current/next
// view. What used to be console-only (the live timing badge, the current
// break's large adjustable-text copy display, the aired/missed/move
// actions, weather/NPR context, wrap-up/submit) now layers onto this same
// list once a rundown is in_progress, rather than living on a second route.
// See CLAUDE.md's "Log: builder and console merged into one screen" note.

const STATUS_VARIANT: Record<LogRundownStatus, BadgeVariant> = {
  draft: "neutral",
  generated: "accent",
  in_progress: "warning",
  submitted: "success",
};

const ITEM_KIND_LABEL: Record<string, string> = {
  content: "Content",
  live_read: "Live read",
  weather: "Weather",
  underwriting_credit: "Underwriting credit",
};

const STATE_LABEL: Record<LiveTimingState, string> = {
  on_time: "On time",
  running_long: "Running long",
  running_short: "Running short",
  at_risk_required: "At risk — required break unfilled",
  at_risk_rejoin: "At risk — network rejoin approaching",
};

const STATE_VARIANT: Record<LiveTimingState, BadgeVariant> = {
  on_time: "success",
  running_long: "danger",
  running_short: "warning",
  at_risk_required: "danger",
  at_risk_rejoin: "danger",
};

const MISS_REASON_LABEL: Record<LogMissReason, string> = {
  network_timing: "Network timing",
  breaking_news: "Breaking news",
  segment_overrun: "Segment overrun",
  technical_problem: "Technical problem",
  host_error: "Host error",
  unavailable_copy: "Unavailable copy",
  other: "Other",
};

function itemDuration(item: RundownItemDetail): number {
  return item.planned_duration_seconds;
}

export default async function RundownDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; moved_from?: string; moved_to?: string }>;
}) {
  const { id } = await params;
  const { error, moved_from, moved_to } = await searchParams;
  const rundown = await getRundownDetail(id);
  if (!rundown) notFound();

  const live = rundown.status === "in_progress" || rundown.status === "submitted";

  const approvedContent = await listContentItems({ approvalStatus: "approved" });
  const allItems = rundown.breaks.flatMap((brk) => brk.items);
  const underwritingCopyIds = [
    ...new Set(
      allItems.flatMap((item) => (item.underwriting_copy_id ? [item.underwriting_copy_id] : [])),
    ),
  ];
  const copyById = new Map(
    (await listUnderwritingCopyForItems(underwritingCopyIds)).map((copy) => [copy.id, copy]),
  );

  // generateRundown() is idempotent on (program_id, air_date) — once this row
  // exists, re-generating just redirects here rather than re-running
  // generation. So a rundown created before a producer added an opportunity
  // (or, as happened once, before a migration seeded one) never picks it up
  // on its own. Compare the clock version's *current* opportunities against
  // what's already here so the page can tell "this clock genuinely has no
  // opportunities" apart from "this rundown is just out of sync" and offer
  // the fix for the latter — see syncRundownBreaks in rundown-actions.ts.
  const currentOpportunities = await listLocalOpportunitiesForVersion(rundown.clock_version_id);
  const shiftDurationMinutes = Math.round(
    (new Date(rundown.shift_end_at).getTime() - new Date(rundown.shift_start_at).getTime()) /
      60_000,
  );
  const missingBreakCount = selectMissingBreakDrafts(
    buildRundownBreakDrafts(currentOpportunities, rundown.shift_start_at, shiftDurationMinutes),
    rundown.breaks,
  ).length;

  const summary = computeRundownSummary(
    rundown.breaks.map((brk) => ({
      requirement: brk.requirement,
      available_duration_seconds: brk.available_duration_seconds,
      occupied_duration_seconds: brk.items.reduce((total, item) => total + itemDuration(item), 0),
      item_count: brk.items.length,
    })),
  );

  // Everything below is only meaningful once the broadcast is actually
  // under way — a draft/generated rundown has no "now" to be current
  // against yet.
  const now = new Date().toISOString();
  const events = live ? await listBroadcastEventsForItems(allItems.map((item) => item.id)) : [];
  const eventCountByItem = new Map<string, number>();
  for (const event of events) {
    eventCountByItem.set(
      event.rundown_item_id,
      (eventCountByItem.get(event.rundown_item_id) ?? 0) + 1,
    );
  }

  const consoleBreaks: ConsoleBreakLike[] = rundown.breaks.map((brk) => ({
    id: brk.id,
    scheduled_at: brk.scheduled_at,
    network_rejoin_at: brk.network_rejoin_at,
    requirement: brk.requirement,
    itemCount: brk.items.length,
    allItemsConfirmed:
      brk.items.length > 0 && brk.items.every((item) => (eventCountByItem.get(item.id) ?? 0) > 0),
  }));
  const timing = live ? computeLiveTimingState(now, consoleBreaks, rundown.shift_end_at) : null;
  const currentBreakId = timing?.currentBreak?.id ?? null;

  const destinationBreaks: MoveDestinationBreakLike[] = rundown.breaks.map((brk) => ({
    id: brk.id,
    scheduled_at: brk.scheduled_at,
    permitted_content_types: brk.permitted_content_types,
    allow_multiple: brk.allow_multiple,
    item_count: brk.items.length,
  }));

  // Both NPR and weather are fetched regardless of live status — a host
  // planning a break ahead of air wants to see (and pick a look-ahead from)
  // upcoming stories, and to add and check today's weather item, the same
  // way they'd plan around a promo, not just once the broadcast has
  // started.
  const [weather, npr] = await Promise.all([
    getCurrentWeatherReading(),
    getNprEpisodeForProgramOnDate(rundown.program_id, rundown.air_date),
  ]);
  const nprLookaheadItems: NprLookaheadItem[] = npr?.kind === "found" ? npr.items : [];
  const currentNprItemIds = new Set(nprLookaheadItems.map((item) => item.npr_item_id));

  const unresolvedEntries = live
    ? listUnresolvedEntries(
        rundown.breaks.map((brk) => ({
          id: brk.id,
          requirement: brk.requirement,
          itemIds: brk.items.map((item) => item.id),
        })),
        new Set(eventCountByItem.keys()),
      )
    : [];

  const renderFillControls = (brk: RundownBreakDetail) => {
    const canAddMore = brk.allow_multiple || brk.items.length === 0;
    if (!canAddMore) return null;
    const eligible = filterEligibleContent(
      approvedContent,
      brk,
      rundown.program_id,
      rundown.air_date,
    );
    const permitsWeather = brk.permitted_content_types.includes("weather");

    return (
      <div className="flex flex-col gap-2 border-t border-line px-5 py-3">
        <form action={fillRundownItem} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="rundown_id" value={rundown.id} />
          <input type="hidden" name="break_id" value={brk.id} />
          <Select
            name="content_item_id"
            className="max-w-[220px]"
            disabled={eligible.length === 0 && !permitsWeather}
            defaultValue=""
          >
            <option value="" disabled>
              {eligible.length === 0 && !permitsWeather ? "No eligible content" : "Add…"}
            </option>
            {permitsWeather && <option value={WEATHER_ITEM_SENTINEL}>Today&apos;s weather</option>}
            {eligible.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" className="px-2.5 py-1.5 text-xs">
            Add
          </Button>
        </form>
        <LiveReadForm rundownId={rundown.id} breakId={brk.id} nprItems={nprLookaheadItems} />
      </div>
    );
  };

  const renderMidBroadcastActions = (
    item: RundownItemDetail,
    brk: RundownBreakDetail,
    compact: boolean,
  ) => {
    const confirmed = (eventCountByItem.get(item.id) ?? 0) > 0;
    if (!live || confirmed) return null;
    const moveDestinations =
      item.item_kind === "content" && item.contentItem
        ? listValidMoveDestinations(
            destinationBreaks,
            brk.id,
            item.contentItem.content_type as LogContentType,
            now,
          )
        : [];
    const buttonClass = compact ? "px-2.5 py-1.5 text-xs" : undefined;
    const detailsSummaryClass = compact
      ? "inline-flex cursor-pointer items-center rounded border border-line px-2.5 py-1.5 text-xs font-bold text-ink-700"
      : "inline-flex cursor-pointer items-center rounded border border-line px-4 py-2.5 text-sm font-bold text-ink-700";

    return (
      <div className={`flex flex-wrap gap-2 ${compact ? "mt-2" : "mt-3"}`}>
        <form action={markAired}>
          <input type="hidden" name="rundown_id" value={rundown.id} />
          <input type="hidden" name="item_id" value={item.id} />
          <Button type="submit" className={buttonClass}>
            Aired
          </Button>
        </form>

        <details className="inline-block">
          <summary className={detailsSummaryClass}>Missed</summary>
          <form
            action={markMissed}
            className="mt-2 flex flex-col gap-2 rounded border border-line p-3"
          >
            <input type="hidden" name="rundown_id" value={rundown.id} />
            <input type="hidden" name="item_id" value={item.id} />
            <Select name="reason" required defaultValue="">
              <option value="" disabled>
                Reason…
              </option>
              {Object.entries(MISS_REASON_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <input
              type="text"
              name="notes"
              placeholder="Brief note (optional)"
              className="rounded border border-line px-3 py-2 text-sm"
            />
            <Button type="submit" variant="secondary">
              Record missed
            </Button>
          </form>
        </details>

        {moveDestinations.length > 0 && (
          <details className="inline-block">
            <summary className={detailsSummaryClass}>Move</summary>
            <form
              action={moveRundownItem}
              className="mt-2 flex flex-col gap-2 rounded border border-line p-3"
            >
              <input type="hidden" name="rundown_id" value={rundown.id} />
              <input type="hidden" name="source_item_id" value={item.id} />
              <Select name="destination_break_id" required defaultValue="">
                <option value="" disabled>
                  Choose an opening…
                </option>
                {moveDestinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {formatStationTimestamp(destination.scheduled_at)}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Move
              </Button>
            </form>
          </details>
        )}
      </div>
    );
  };

  const mainContent = (
    <>
      <Link href="/log" className="text-xs font-semibold text-brand-link">
        ← Back to Today
      </Link>

      {/* rundown.programName itself is the sticky bar's <h1> (rundown-live-layout.tsx) —
          not repeated here, see the "two program name headers" fix. */}
      <div className="mt-2 mb-1 flex flex-wrap items-center gap-2.5">
        <Badge variant={STATUS_VARIANT[rundown.status]}>{rundown.status.replace("_", " ")}</Badge>
      </div>
      <p className="mb-4 text-xs text-ink-500">
        {rundown.air_date} · {formatStationTimestamp(rundown.shift_start_at)} –{" "}
        {formatStationTimestamp(rundown.shift_end_at)}
      </p>

      {error && <Alert className="mb-4">{error}</Alert>}
      {moved_from && moved_to && (
        <Alert variant="info" className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <span>Moved.</span>
            <form action={moveRundownItem}>
              <input type="hidden" name="rundown_id" value={rundown.id} />
              <input type="hidden" name="source_item_id" value={moved_to} />
              <input type="hidden" name="destination_break_id" value={currentBreakId ?? ""} />
              <Button type="submit" variant="ghost">
                Dismiss
              </Button>
            </form>
          </div>
        </Alert>
      )}

      <div className="mb-6 flex flex-wrap gap-2 text-xs text-ink-700">
        <Badge variant={summary.ready ? "success" : "warning"}>{summary.filledBreaks} filled</Badge>
        <Badge variant="muted">{summary.carryingNetworkBreaks} carrying network</Badge>
        {summary.unresolvedRequiredBreaks > 0 && (
          <Badge variant="danger">
            {summary.unresolvedRequiredBreaks} required, still needs something
          </Badge>
        )}
        {summary.overCount > 0 && (
          <Badge variant="danger">
            {summary.overCount} running over ({summary.totalOverSeconds}s total)
          </Badge>
        )}
      </div>

      {missingBreakCount > 0 && (
        <Alert variant="note" className="mb-4">
          This rundown was generated before{" "}
          {missingBreakCount === 1 ? "an opportunity" : "some opportunities"}{" "}
          {missingBreakCount === 1 ? "was" : "were"} added to this clock, so{" "}
          {missingBreakCount === 1 ? "it isn't" : "they aren't"} showing below.{" "}
          <form action={syncRundownBreaks} className="mt-2 inline-block">
            <input type="hidden" name="rundown_id" value={rundown.id} />
            <Button type="submit" className="px-2.5 py-1.5 text-xs">
              Sync {missingBreakCount === 1 ? "it" : "them"} in now
            </Button>
          </form>
        </Alert>
      )}

      {rundown.breaks.length === 0 ? (
        <div className="rounded border border-dashed border-line p-6 text-sm text-ink-500">
          This clock has no local opportunities defined yet — every bit of it is network-automatic,
          so there&apos;s nothing here for a host to fill. A producer can add opportunities from the
          clock template screen.
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {rundown.breaks.map((brk) => {
            const occupied = brk.items.reduce((total, item) => total + itemDuration(item), 0);
            const fit = computeBreakFit(brk.available_duration_seconds, occupied);
            const status = computeBreakStatus({
              requirement: brk.requirement,
              item_count: brk.items.length,
              fit,
            });
            const isCurrent = live && brk.id === currentBreakId;

            const statusBadge =
              status === "carrying_network" ? (
                <Badge variant="muted">Carrying network</Badge>
              ) : status === "unresolved_required" ? (
                <Badge variant="danger">Needs something</Badge>
              ) : status === "over" ? (
                <Badge variant="danger">{fit.overSeconds}s over</Badge>
              ) : (
                <Badge variant="success">{fit.remainingSeconds}s to spare</Badge>
              );

            return (
              <li
                key={brk.id}
                id={isCurrent ? "current-break" : undefined}
                className={
                  isCurrent ? "rounded border-2 border-brand-primary" : "rounded border border-line"
                }
              >
                <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-panel-50 px-5 py-3">
                  {isCurrent && <Badge variant="warning">Live now</Badge>}
                  <span className="font-mono text-sm font-bold text-ink-900">
                    {formatStationTimestamp(brk.scheduled_at)}
                  </span>
                  <span className="text-sm font-semibold text-ink-900">{brk.label}</span>
                  <Badge variant={brk.requirement === "required" ? "warning" : "neutral"}>
                    {brk.requirement}
                  </Badge>
                  <span className="ml-auto text-xs text-ink-500">
                    Rejoin network by {formatStationTimestamp(brk.network_rejoin_at)} ·{" "}
                    {brk.available_duration_seconds}s available
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
                  {statusBadge}
                  {status === "carrying_network" && (
                    <span className="text-xs text-ink-400">
                      Nothing placed — the network feed simply continues. That&apos;s fine.
                    </span>
                  )}
                </div>

                {brk.items.length > 0 && (
                  <ul className="flex flex-col gap-3 px-5 py-4">
                    {brk.items.map((item) => {
                      const copy = item.underwriting_copy_id
                        ? copyById.get(item.underwriting_copy_id)
                        : null;
                      const effectiveScript =
                        item.override_script ??
                        item.contentItem?.script ??
                        copy?.script ??
                        item.live_read_script ??
                        (item.item_kind === "weather" ? (weather.reading?.live_read_text ?? null) : null);
                      const masterDuration = item.contentItem
                        ? computeTotalDurationSeconds(
                            item.contentItem.components,
                            item.contentItem.expected_duration_seconds,
                          )
                        : null;
                      const isOverridden =
                        item.override_duration_seconds !== null ||
                        item.override_script !== null ||
                        item.override_live_intro_seconds !== null ||
                        item.override_live_outro_seconds !== null ||
                        item.override_tag_seconds !== null;
                      const title =
                        item.contentItem?.title ?? item.live_read_title ?? copy?.label ?? "Weather";
                      // Flags a look-ahead whose source story may no longer exist in the
                      // current NPR episode data — a real, if rare, mid-broadcast story
                      // substitution (see the migration's comment). Never auto-corrected;
                      // just surfaced so a host can check it before airing.
                      const nprSourceStale =
                        item.source_npr_item_id !== null &&
                        !currentNprItemIds.has(item.source_npr_item_id);

                      return (
                        <li
                          key={item.id}
                          className="rounded border border-line/70 bg-panel-50/50 p-3"
                        >
                          {nprSourceStale && (
                            <Badge variant="danger" className="mb-2">
                              Source story may have changed — check before airing
                            </Badge>
                          )}
                          {isCurrent ? (
                            <CopyDisplay
                              title={title}
                              script={effectiveScript}
                              summary={item.contentItem?.summary ?? null}
                            />
                          ) : (
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant="accent">
                                    {ITEM_KIND_LABEL[item.item_kind] ?? item.item_kind}
                                  </Badge>
                                  {isOverridden && (
                                    <Badge variant="warning">overridden for this airing</Badge>
                                  )}
                                  <span className="text-sm font-semibold text-ink-900">
                                    {title}
                                  </span>
                                </div>
                                {item.contentItem && (
                                  <div className="mt-0.5 text-xs text-ink-400">
                                    {CONTENT_TYPE_LABEL[item.contentItem.content_type]}
                                    {masterDuration !== null && ` · master ${masterDuration}s`}
                                  </div>
                                )}
                                {copy && (
                                  <div className="mt-0.5 text-xs text-ink-400">
                                    {copy.execution_kind === "recorded"
                                      ? `DAD cart ${copy.cart_identifier ?? "—"}`
                                      : "Live read"}
                                  </div>
                                )}
                                {effectiveScript && (
                                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-ink-700">
                                    {effectiveScript}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 font-mono text-xs font-semibold text-ink-900">
                                {itemDuration(item)}s
                              </span>
                            </div>
                          )}

                          {renderMidBroadcastActions(item, brk, !isCurrent)}

                          {item.item_kind !== "underwriting_credit" && (
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <form action={removeRundownItem}>
                                <input type="hidden" name="rundown_id" value={rundown.id} />
                                <input type="hidden" name="item_id" value={item.id} />
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  className="px-2.5 py-1.5 text-xs"
                                >
                                  Remove
                                </Button>
                              </form>
                              {(item.item_kind === "content" || item.item_kind === "weather") && (
                                <details>
                                  <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                                    Adjust for this airing
                                  </summary>
                                  <form
                                    action={updateItemOverrides}
                                    className="mt-2 flex flex-col gap-2"
                                  >
                                    <input type="hidden" name="rundown_id" value={rundown.id} />
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <Input
                                      name="override_script"
                                      placeholder="Script for this airing only"
                                      defaultValue={item.override_script ?? ""}
                                    />
                                    <div className="flex gap-2">
                                      <Input
                                        name="override_duration_seconds"
                                        type="number"
                                        min={1}
                                        placeholder="Duration (s)"
                                        defaultValue={item.override_duration_seconds ?? ""}
                                        className="w-32"
                                      />
                                      <Button
                                        type="submit"
                                        variant="secondary"
                                        className="px-2.5 py-1.5 text-xs"
                                      >
                                        Save override
                                      </Button>
                                    </div>
                                  </form>
                                </details>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {renderFillControls(brk)}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );

  const sidebarContent = (
    <>
      <div className="rounded border border-line p-4">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
          Network rejoin
        </div>
        <p className="text-sm text-ink-700">{formatStationTimestamp(rundown.shift_end_at)}</p>
      </div>

      <div className="rounded border border-line p-4">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Weather</div>
        {weather.reading ? (
          <>
            <p className="text-sm text-ink-700">{weather.reading.condensed_text}</p>
            <p className="mt-1 text-xs text-ink-400">
              Updated {formatStationTimestamp(weather.reading.last_updated_at)}
              {weather.stale && " · stale"}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                Full forecast
              </summary>
              <div className="mt-2 flex flex-col gap-1.5 text-xs text-ink-700">
                {(weather.reading.high_temp !== null || weather.reading.low_temp !== null) && (
                  <p className="font-semibold text-ink-900">
                    {weather.reading.high_temp !== null && `High ${weather.reading.high_temp}°`}
                    {weather.reading.high_temp !== null && weather.reading.low_temp !== null && " · "}
                    {weather.reading.low_temp !== null && `Low ${weather.reading.low_temp}°`}
                  </p>
                )}
                <p>{weather.reading.conditions_summary}</p>
                {weather.reading.precipitation_notes && <p>{weather.reading.precipitation_notes}</p>}
                {weather.reading.hazards && (
                  <p className="font-semibold text-danger">{weather.reading.hazards}</p>
                )}
                <p className="whitespace-pre-wrap border-t border-line pt-1.5">
                  {weather.reading.live_read_text}
                </p>
                <p className="text-ink-400">
                  Valid through {formatStationTimestamp(weather.reading.valid_through_at)}
                </p>
              </div>
            </details>
          </>
        ) : (
          <p className="text-xs text-ink-400">No reading yet.</p>
        )}
      </div>

      <div className="rounded border border-line p-4">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
          NPR — coming up
        </div>
        {npr?.kind === "found" && npr.items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {npr.items.slice(0, 4).map((item) => (
              <li key={item.id} className="text-xs text-ink-700">
                <span className="font-semibold">{item.title}</span>
              </li>
            ))}
          </ul>
        ) : npr?.kind === "unmapped" || npr?.kind === "not_configured" ? (
          <p className="text-xs text-ink-400">Not available for this program.</p>
        ) : (
          <p className="text-xs text-ink-400">No episode data yet.</p>
        )}
      </div>

      <div className="rounded border border-line p-4">
        {!live ? (
          <>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
              Status
            </div>
            <p className="mb-3 text-xs text-ink-500">
              This rundown hasn&apos;t started yet. Starting it marks it in progress and turns on
              live timing, aired/missed/move, and today&apos;s weather above. NPR is already shown
              for planning look-aheads.
            </p>
            <form action={startBroadcast}>
              <input type="hidden" name="rundown_id" value={rundown.id} />
              <Button type="submit">Start broadcast</Button>
            </form>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-400">
                Wrap up
              </span>
              {unresolvedEntries.length > 0 && (
                <Badge variant="warning">{unresolvedEntries.length} unresolved</Badge>
              )}
            </div>
            {unresolvedEntries.length > 0 && (
              <p className="mb-3 text-xs text-ink-500">
                {unresolvedEntries.length} thing{unresolvedEntries.length === 1 ? "" : "s"} still
                need an aired, missed, or moved outcome — or content for a required break.
                Submitting doesn&apos;t require resolving them first.
              </p>
            )}
            <form action={submitRundown}>
              <input type="hidden" name="rundown_id" value={rundown.id} />
              <Button
                type="submit"
                variant={rundown.status === "submitted" ? "secondary" : "primary"}
              >
                {rundown.status === "submitted" ? "Re-submit" : "Submit rundown"}
              </Button>
            </form>
            {rundown.status === "submitted" && rundown.submitted_at && (
              <p className="mt-2 text-xs text-ink-400">
                Submitted {formatStationTimestamp(rundown.submitted_at)}. Corrections still work
                above.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      {live && <LogPoller intervalMs={15000} />}
      <RundownLiveLayout
        programName={rundown.programName}
        stateLabel={timing ? STATE_LABEL[timing.state] : null}
        stateVariant={timing ? STATE_VARIANT[timing.state] : null}
        hasCurrentBreak={currentBreakId !== null}
        mainContent={mainContent}
        sidebarContent={sidebarContent}
      />
    </>
  );
}
