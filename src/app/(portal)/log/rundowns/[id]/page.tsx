import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import {
  CONTENT_TYPE_LABEL,
  componentScriptText,
  computeTotalDurationSeconds,
  WEATHER_DEFAULT_DURATION_SECONDS,
} from "@/lib/log/content-library";
import {
  getRundownDetail,
  hasOpenUnderwritingExceptions,
  listBroadcastEventsForItems,
  listClockSlotsForVersion,
  listContentItemsWithComponents,
  listLocalOpportunitiesForVersion,
  listUnderwritingCopyForItems,
  toRundownOpportunity,
  type LogBroadcastEventRow,
  type RundownBreakDetail,
  type RundownItemDetail,
} from "@/lib/log/queries";
import {
  buildSegmentWindows,
  episodeHourOffset,
  estimateFloatLanding,
  estimateStoryOffsets,
  excludeBlockLengthRollups,
  firstAiringByStory,
  packedHourCount,
  projectStoriesOntoShift,
  selectAiringsInWindow,
} from "@/lib/log/npr-story-times";
import {
  computeLiveTimingState,
  type ConsoleBreakLike,
  type LiveTimingState,
} from "@/lib/log/console-timing";
import type { RelocatableItemKind } from "@/lib/log/mid-broadcast";
import { filterEligibleContent } from "@/lib/log/rundown-eligibility";
import {
  buildRundownBreakDrafts,
  selectMissingBreakDrafts,
  selectNonOverlappingBreakDrafts,
} from "@/lib/log/rundown-generation";
import { computeBreakStatuses, computeItemTimings, computeRundownSummary } from "@/lib/log/timing";
import { listUnresolvedEntries } from "@/lib/log/submission";
import { getCurrentWeatherReading, getDailyOutlook, getForecastPeriods } from "@/lib/log/weather";
import { getNprEpisodeForProgramOnDate } from "@/lib/log/npr";
import { formatStationClockTime, formatStationTimeHM, formatStationTimestamp } from "@/lib/log/timezone";
import { StationClock } from "@/components/log/station-clock";
import { Countdown } from "@/components/log/countdown";
import { WeatherOutlookStrip } from "@/components/log/weather-outlook-strip";
import { ForecastSummary } from "@/components/log/forecast-summary";
import { LogPoller } from "../../log-poller";
import {
  attestOrdinaryContentAired,
  attestUnderwritingCredits,
  markAired,
  markMissed,
  startBroadcast,
  submitRundown,
} from "../../broadcast-actions";
import {
  relocateRundownItem,
  relocateUnderwritingCredit,
  removeRundownItem,
  syncRundownBreaks,
  updateItemOverrides,
} from "../../rundown-actions";
import type { NprLookaheadItem } from "./live-read-form";
import type { InsertConfig } from "./insertion-point";
import { RundownLiveLayout } from "./rundown-live-layout";
import { RundownBreaksBoard, type BreakBoardBreak, type BreakBoardItem } from "./rundown-breaks-board";
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
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const rundown = await getRundownDetail(id);
  if (!rundown) notFound();

  const live = rundown.status === "in_progress" || rundown.status === "submitted";
  const allItems = rundown.breaks.flatMap((brk) => brk.items);
  const underwritingCopyIds = [
    ...new Set(
      allItems.flatMap((item) => (item.underwriting_copy_id ? [item.underwriting_copy_id] : [])),
    ),
  ];

  // Every read below depends only on `rundown` (already fetched above), not
  // on each other, so they're fetched together rather than one at a time.
  // This screen fully re-renders after every single mid-broadcast action —
  // including "add this to a break," via fillRundownItem's
  // revalidatePath+redirect — and running eight independent reads
  // sequentially (two of which, weather and NPR, can themselves be a real
  // outbound network call when their cache is stale — see lib/log/weather.ts
  // and lib/log/npr.ts's lazy-refresh-at-read-time design) is what turned a
  // single click into a multi-second "Adding…" wait.
  const [
    approvedContent,
    rawUnderwritingCopy,
    rawOpportunities,
    clockSlots,
    weather,
    npr,
    events,
    hasOpenExceptions,
  ] = await Promise.all([
    listContentItemsWithComponents({ approvalStatus: "approved" }),
    listUnderwritingCopyForItems(underwritingCopyIds),
    listLocalOpportunitiesForVersion(rundown.clock_version_id),
    listClockSlotsForVersion(rundown.clock_version_id),
    getCurrentWeatherReading(),
    getNprEpisodeForProgramOnDate(rundown.program_id, rundown.air_date),
    live
      ? listBroadcastEventsForItems(allItems.map((item) => item.id))
      : (Promise.resolve([]) as Promise<LogBroadcastEventRow[]>),
    live ? hasOpenUnderwritingExceptions(rundown.id) : Promise.resolve(false),
  ]);
  const copyById = new Map(rawUnderwritingCopy.map((copy) => [copy.id, copy]));

  // generateRundown() is idempotent on (program_id, air_date) — once this row
  // exists, re-generating just redirects here rather than re-running
  // generation. So a rundown created before a producer added an opportunity
  // (or, as happened once, before a migration seeded one) never picks it up
  // on its own. Compare the clock version's *current* opportunities against
  // what's already here so the page can tell "this clock genuinely has no
  // opportunities" apart from "this rundown is just out of sync" and offer
  // the fix for the latter — see syncRundownBreaks in rundown-actions.ts.
  const currentOpportunities = rawOpportunities.map(toRundownOpportunity);
  const shiftDurationMinutes = Math.round(
    (new Date(rundown.shift_end_at).getTime() - new Date(rundown.shift_start_at).getTime()) /
      60_000,
  );
  // An imported rundown's breaks came from the uploaded program-log export,
  // which only prints the windows DAD scheduled something into — the
  // clock's other local opportunities (a newscast cover, a promo slot) are
  // real and fillable but absent from the export, so the same sync
  // affordance applies with a window-overlap dedup in place of the exact
  // opportunity+instant match (an export avail sits a second or two off the
  // clock's own offset for the same window). See
  // selectNonOverlappingBreakDrafts and syncRundownBreaks.
  const allDrafts = buildRundownBreakDrafts(
    currentOpportunities,
    rundown.shift_start_at,
    shiftDurationMinutes,
  );
  const missingDrafts = selectMissingBreakDrafts(allDrafts, rundown.breaks);
  const missingBreakCount = (
    rundown.source === "imported"
      ? selectNonOverlappingBreakDrafts(
          missingDrafts,
          rundown.breaks.filter((brk) => brk.local_opportunity_id === null),
        )
      : missingDrafts
  ).length;

  // Per-break status, computed once for the whole rundown so a break can
  // read as 'covered_by_previous' when the break just before it holds
  // content that runs past its own window into this one — see
  // lib/log/timing.ts's computeBreakStatuses. Both the header summary and
  // each break's own badge below read from this same map.
  const breakStatusesById = new Map(
    computeBreakStatuses(
      rundown.breaks.map((brk) => ({
        id: brk.id,
        requirement: brk.requirement,
        available_duration_seconds: brk.available_duration_seconds,
        occupied_duration_seconds: brk.items.reduce((total, item) => total + itemDuration(item), 0),
        item_count: brk.items.length,
        scheduled_at: brk.scheduled_at,
        network_rejoin_at: brk.network_rejoin_at,
      })),
    ).map((result) => [result.id, result]),
  );
  const breakLabelById = new Map(rundown.breaks.map((brk) => [brk.id, brk.label]));

  // The rejoin deadline for a break, extended through planned spillover:
  // when a break's content is planned to run through the following
  // break(s) (covered_by_previous / preempted_by_previous, from the same
  // computeBreakStatuses pass as the badges), "back to the network feed"
  // happens at the end of the covered chain, not at the break's own
  // boundary. Spillover only ever chains through contiguous breaks (no-gap
  // rule in lib/log/timing.ts), so walking forward while the next break is
  // covered is exact. Returns the covering chain's last break too, so the
  // sidebar widget can say why the time is later than the break's own.
  const effectiveRejoin = (
    breakId: string,
  ): { rejoinAt: string; runsThroughLabel: string | null; finalBreakId: string | null } => {
    const index = rundown.breaks.findIndex((brk) => brk.id === breakId);
    if (index === -1) return { rejoinAt: rundown.shift_end_at, runsThroughLabel: null, finalBreakId: null };
    let last = index;
    while (last + 1 < rundown.breaks.length) {
      const status = breakStatusesById.get(rundown.breaks[last + 1]!.id)?.status;
      if (status !== "covered_by_previous" && status !== "preempted_by_previous") break;
      last += 1;
    }
    return {
      rejoinAt: rundown.breaks[last]!.network_rejoin_at,
      runsThroughLabel: last === index ? null : rundown.breaks[last]!.label,
      finalBreakId: rundown.breaks[last]!.id,
    };
  };

  // Each item's own on-air start/end time, prominent on its card — derived
  // from the break's scheduled_at plus every earlier item's duration in the
  // same break (lib/log/timing.ts's computeItemTimings), keyed per break so
  // two breaks' items never collide.
  const itemTimingByBreakAndId = new Map(
    rundown.breaks.map((brk) => [
      brk.id,
      new Map(
        computeItemTimings(
          brk.scheduled_at,
          brk.items.map((item) => ({ id: item.id, durationSeconds: itemDuration(item) })),
        ).map((timing) => [timing.id, timing]),
      ),
    ]),
  );

  const summary = computeRundownSummary(
    rundown.breaks.map((brk) => ({
      id: brk.id,
      requirement: brk.requirement,
      available_duration_seconds: brk.available_duration_seconds,
      occupied_duration_seconds: brk.items.reduce((total, item) => total + itemDuration(item), 0),
      item_count: brk.items.length,
      scheduled_at: brk.scheduled_at,
      network_rejoin_at: brk.network_rejoin_at,
    })),
  );

  // Everything below is only meaningful once the broadcast is actually
  // under way — a draft/generated rundown has no "now" to be current
  // against yet. (events itself was already fetched above, alongside every
  // other independent read.)
  const now = new Date().toISOString();
  const eventCountByItem = new Map<string, number>();
  for (const event of events) {
    eventCountByItem.set(
      event.rundown_item_id,
      (eventCountByItem.get(event.rundown_item_id) ?? 0) + 1,
    );
  }
  // Distinct from "confirmed" (eventCountByItem > 0, which is also true for
  // a missed item): an underwriting credit that's only ever been marked
  // missed can still be relocated (see relocateUnderwritingCredit) — only
  // an actual aired_as_scheduled event locks it. Ordinary content doesn't
  // need this distinction; nothing downstream reacts to its outcome the
  // way the credit/exception pipeline does.
  const airedItemIds = new Set(
    events.filter((event) => event.outcome === "aired_as_scheduled").map((event) => event.rundown_item_id),
  );

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

  // Both NPR and weather are fetched regardless of live status — a host
  // planning a break ahead of air wants to see (and pick a look-ahead from)
  // upcoming stories, and to add and check today's weather item, the same
  // way they'd plan around a promo, not just once the broadcast has
  // started. (Fetched above, alongside every other independent read.)

  // Estimated per-story air times: pack the episode's stories, in order,
  // into this clock's lettered segment windows, then project onto the
  // shift's actual hours via the program's feed anchor
  // (lib/log/npr-story-times.ts — CDS gives duration and order, never
  // explicit times, so these are estimates and always render with "~").
  const shiftStartMs = new Date(rundown.shift_start_at).getTime();
  const shiftHourCount = Math.max(
    1,
    Math.round((new Date(rundown.shift_end_at).getTime() - shiftStartMs) / 3_600_000),
  );
  const segmentWindows = buildSegmentWindows(clockSlots, shiftHourCount);
  const storyEstimates =
    npr?.kind === "found"
      ? estimateStoryOffsets(
          excludeBlockLengthRollups(
            npr.items.map((item) => ({
              npr_item_id: item.npr_item_id,
              duration_seconds: item.duration_seconds,
            })),
            segmentWindows,
          ),
          segmentWindows,
        )
      : [];
  const shiftAirings = projectStoriesOntoShift(
    storyEstimates,
    shiftHourCount,
    episodeHourOffset(
      rundown.shift_start_at,
      rundown.programNprFeedStartHourEt,
      packedHourCount(storyEstimates),
    ),
  );
  const hasStoryTimes = shiftAirings.length > 0;
  const firstAirings = firstAiringByStory(shiftAirings);
  const storyTimeLabel = (offsetSeconds: number | null): string | null =>
    offsetSeconds === null
      ? null
      : `~${formatStationTimeHM(new Date(shiftStartMs + offsetSeconds * 1000).toISOString())}`;

  const nprLookaheadItems: NprLookaheadItem[] =
    npr?.kind === "found"
      ? npr.items.map((item) => ({
          npr_item_id: item.npr_item_id,
          title: item.title,
          teaser: item.teaser,
          estimatedTimeLabel: storyTimeLabel(
            firstAirings.get(item.npr_item_id)?.offsetSeconds ?? null,
          ),
        }))
      : [];
  const currentNprItemIds = new Set(nprLookaheadItems.map((item) => item.npr_item_id));
  const lookaheadByNprItemId = new Map(nprLookaheadItems.map((item) => [item.npr_item_id, item]));

  // The stories estimated to air between one break and the next — what a
  // host forward-promotes *at* that break, so it's what the live-read
  // picker offers there and what the sidebar shows for the upcoming break.
  // Falls back to the full episode list when no times could be derived (a
  // clock with no lettered segments).
  const breakStartOffsets = rundown.breaks.map(
    (brk) => (new Date(brk.scheduled_at).getTime() - shiftStartMs) / 1000,
  );
  const storiesAfterBreak = (index: number): NprLookaheadItem[] => {
    if (!hasStoryTimes) return nprLookaheadItems;
    const from = breakStartOffsets[index]!;
    const to = index + 1 < breakStartOffsets.length ? breakStartOffsets[index + 1]! : null;
    return selectAiringsInWindow(shiftAirings, from, to).flatMap((airing) => {
      const item = lookaheadByNprItemId.get(airing.npr_item_id);
      return item ? [{ ...item, estimatedTimeLabel: storyTimeLabel(airing.offsetSeconds) }] : [];
    });
  };

  // The sidebar's "coming up" panel: the next *story segment's* stories, by
  // the station's wall clock (the page re-renders on LogPoller's interval,
  // so this tracks the broadcast as it runs). Starting at the upcoming
  // break, walk the break-to-break windows forward and show the first one
  // that actually contains stories — scoping to exactly the upcoming
  // break's own window left the panel blank whenever the next break was a
  // short music-bed cover with another break right behind it, which during
  // a live broadcast was most of the time.
  const nowMs = new Date(now).getTime();
  const upcomingBreakIndex =
    rundown.breaks.length === 0
      ? null
      : (() => {
          const index = breakStartOffsets.findIndex(
            (offset) => shiftStartMs + offset * 1000 >= nowMs,
          );
          return index === -1 ? breakStartOffsets.length - 1 : index;
        })();
  const nextStoryWindow = (() => {
    if (!hasStoryTimes || upcomingBreakIndex === null) return null;
    for (let index = upcomingBreakIndex; index < rundown.breaks.length; index++) {
      const stories = storiesAfterBreak(index);
      if (stories.length > 0) return { breakIndex: index, stories };
    }
    return null;
  })();
  const sidebarNprStories = hasStoryTimes
    ? (nextStoryWindow?.stories ?? [])
    : nprLookaheadItems.slice(0, 4);
  const sidebarNprHeading = nextStoryWindow
    ? `After the ${formatStationTimeHM(rundown.breaks[nextStoryWindow.breakIndex]!.scheduled_at)} break`
    : null;

  const unresolvedEntries = live
    ? listUnresolvedEntries(
        rundown.breaks.map((brk) => ({
          id: brk.id,
          requirement: brk.requirement,
          items: brk.items.map((item) => ({
            id: item.id,
            requiresConfirmation: item.item_kind === "underwriting_credit",
          })),
        })),
        new Set(eventCountByItem.keys()),
      )
    : [];

  // The wrap-up panel's two batch attestations — see broadcast-actions.ts's
  // submitRundown/attestUnderwritingCredits/attestOrdinaryContentAired for
  // the write side.
  const underwritingItems = allItems.filter((item) => item.item_kind === "underwriting_credit");
  const unconfirmedUnderwritingCount = underwritingItems.filter(
    (item) => (eventCountByItem.get(item.id) ?? 0) === 0,
  ).length;
  const ordinaryItems = allItems.filter((item) => item.item_kind !== "underwriting_credit");
  const unconfirmedOrdinaryCount = ordinaryItems.filter(
    (item) => (eventCountByItem.get(item.id) ?? 0) === 0,
  ).length;

  // Config for the breaks board's insertion points (insertion-point.tsx) —
  // replaces the old bottom-of-break "Add…" <select> + "Create a one-off
  // live read" <details> entirely. Null when the break can't take anything
  // more, same canAddMore gate the old dropdown used.
  const buildInsertConfig = (brk: RundownBreakDetail, breakIndex: number): InsertConfig | null => {
    const eligible = filterEligibleContent(approvedContent, brk, rundown.air_date);

    return {
      rundownId: rundown.id,
      breakId: brk.id,
      eligibleContent: eligible.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        // The same total (components + expected_duration_seconds) buildRundownItem
        // itself computes for planned_duration_seconds — shown here so a host can
        // tell candidates apart by length before picking, not just by name.
        durationSeconds: computeTotalDurationSeconds(candidate.components, candidate.expected_duration_seconds),
      })),
      permitsWeather: brk.permitted_content_types.includes("weather"),
      weatherDurationSeconds: WEATHER_DEFAULT_DURATION_SECONDS,
      // Only the stories a host would actually promote at this break — the
      // ones estimated to air between it and the next — not the whole
      // episode (see storiesAfterBreak above).
      nprItems: storiesAfterBreak(breakIndex),
    };
  };

  // Ordinary content shows no mid-broadcast action at all now — "Move" was
  // replaced by the breaks board's drag-and-drop (a plain rundown edit now,
  // not a broadcast outcome; see lib/log/mid-broadcast.ts), "missed" is just
  // Remove (stage 1), and "aired" moved off the card entirely to the
  // wrap-up panel's optional, non-blocking batch action
  // (attestOrdinaryContentAired) — nothing downstream needs a per-item
  // confirmation for it, so per-item confirmation is not the default; the
  // batch action is there for a host who wants a complete record anyway.
  //
  // Underwriting credits get a visually distinct callout instead of blending
  // in with ordinary content: they're the one item kind with a real
  // contractual "must air" obligation, and the only kind whose outcome the
  // exception/makegood pipeline reacts to
  // (uw_flag_exception_from_broadcast_event). Once one is settled as aired,
  // nothing more shows here — that's genuinely done. Once it's marked
  // missed, the fix is the same drag/"Move to…" affordance the card's own
  // corner menu already offers (draggable is true for it below, since
  // relocateUnderwritingCredit works on a missed-but-not-aired credit) —
  // this panel just explains that's the default response, rather than
  // asking the host to separately go create a makegood in Underwriting &
  // Traffic. See CLAUDE.md's 2026-08-09 note: only a credit still missed
  // and unmoved when the broadcast wraps escalates to that tool at all.
  const renderMidBroadcastActions = (item: RundownItemDetail, breakScheduledAt: string) => {
    if (!live || item.item_kind !== "underwriting_credit" || airedItemIds.has(item.id)) return null;

    const missed = (eventCountByItem.get(item.id) ?? 0) > 0;

    if (missed) {
      return (
        <div className="mt-2 rounded border-2 border-danger bg-danger/5 p-3">
          <p className="text-sm font-semibold text-ink-900">
            Missed at {formatStationClockTime(breakScheduledAt)}.
          </p>
          <p className="mt-1 text-xs text-ink-700">
            Drag this credit (⠿ above) or use its ⋮ menu&apos;s &quot;Move to…&quot; to reschedule it into another
            open break in this broadcast — that&apos;s the default fix, and destinations are offered closest to the
            original time first. Underwriting &amp; Traffic only needs to schedule a makegood if it&apos;s still
            unresolved when this broadcast wraps up.
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2 rounded border-2 border-brand-primary bg-brand-surface/30 p-3">
        <p className="mb-2 text-sm font-semibold text-ink-900">
          Did this air at {formatStationClockTime(breakScheduledAt)}?
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={markAired}>
            <input type="hidden" name="rundown_id" value={rundown.id} />
            <input type="hidden" name="item_id" value={item.id} />
            <Button type="submit">Yes, aired</Button>
          </form>
          <details className="inline-block">
            <summary className="inline-flex cursor-pointer items-center rounded border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink-700">
              No — flag it
            </summary>
            <form
              action={markMissed}
              className="mt-2 flex flex-col gap-2 rounded border border-line bg-white p-3"
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
        </div>
        <p className="mt-2 text-xs text-ink-700">
          If you flag it missed, you can move it to another open break in this same broadcast right from this
          card — Underwriting &amp; Traffic only gets involved if it&apos;s still unresolved once this broadcast
          wraps up.
        </p>
      </div>
    );
  };

  // Every break/item view model the breaks board (drag-and-drop) needs to
  // render and validate drops — built here, server-side, from the same data
  // the old inline rendering used, so nothing about what's shown changes,
  // only how relocation works.
  // Where a floating break actually lands today, from the NPR story
  // boundaries (see lib/log/npr-story-times.ts's estimateFloatLanding) — a
  // float's scheduled_at snapshot is only its nominal placement, and the
  // real position within its earliest/latest window is decided by where the
  // network's stories break around it.
  const opportunityById = new Map(currentOpportunities.map((opportunity) => [opportunity.id, opportunity]));

  // One computation of a floating break's window and today's estimated
  // landing, shared by the break card's hint and the rejoin widget's
  // listen-for-it note below — the two must never disagree about where a
  // float lands.
  const floatDetailsForBreak = (breakId: string) => {
    const breakIndex = rundown.breaks.findIndex((brk) => brk.id === breakId);
    if (breakIndex === -1) return null;
    const brk = rundown.breaks[breakIndex]!;
    const opportunity =
      brk.local_opportunity_id === null ? undefined : opportunityById.get(brk.local_opportunity_id);
    if (
      opportunity?.timing_mode !== "float" ||
      opportunity.earliest_start_offset_seconds === null ||
      opportunity.latest_start_offset_seconds === null
    ) {
      return null;
    }
    const breakOffset = breakStartOffsets[breakIndex]!;
    const hourStart = Math.floor(breakOffset / 3600) * 3600;
    const atOffset = (offsetSeconds: number) =>
      formatStationTimeHM(new Date(shiftStartMs + offsetSeconds * 1000).toISOString());
    const windowLabel = `${atOffset(hourStart + opportunity.earliest_start_offset_seconds)}–${atOffset(hourStart + opportunity.latest_start_offset_seconds)}`;
    const landing = hasStoryTimes
      ? estimateFloatLanding(
          {
            earliestOffsetSeconds: hourStart + opportunity.earliest_start_offset_seconds,
            latestOffsetSeconds: hourStart + opportunity.latest_start_offset_seconds,
            nominalOffsetSeconds: breakOffset,
          },
          shiftAirings,
        )
      : null;
    const boundaryTitle = landing?.boundaryStoryId
      ? (lookaheadByNprItemId.get(landing.boundaryStoryId)?.title ?? null)
      : null;
    const spanningTitle = landing?.spanningStoryId
      ? (lookaheadByNprItemId.get(landing.spanningStoryId)?.title ?? null)
      : null;
    return { windowLabel, atOffset, landing, boundaryTitle, spanningTitle };
  };

  const floatHintForBreak = (brk: RundownBreakDetail): ReactNode => {
    const details = floatDetailsForBreak(brk.id);
    if (!details) return null;
    const { windowLabel, atOffset, landing, boundaryTitle, spanningTitle } = details;
    if (!landing) {
      return (
        <div className="border-b border-line bg-panel-50 px-5 pb-3 text-xs text-ink-500">
          Floating break — the network places it anywhere in {windowLabel}.
        </div>
      );
    }
    return (
      <div className="border-b border-line bg-panel-50 px-5 pb-3 text-xs text-ink-500">
        Floating break (window {windowLabel}) — {" "}
        {landing.basis === "story_boundary" ? (
          <>
            estimated today at{" "}
            <span className="font-mono font-semibold text-ink-700 tabular-nums">
              ~{atOffset(landing.offsetSeconds)}
            </span>
            {boundaryTitle && <> after &ldquo;{boundaryTitle}&rdquo;</>}, from NPR story lengths.
          </>
        ) : spanningTitle ? (
          <>
            &ldquo;{spanningTitle}&rdquo; is estimated to run through this whole window, so the break
            interrupts it — shown at its nominal ~{atOffset(landing.offsetSeconds)}.
          </>
        ) : (
          <>no NPR story boundary maps into it today — shown at its nominal ~{atOffset(landing.offsetSeconds)}.</>
        )}
      </div>
    );
  };

  // Today's NPR-estimated landing, as a short clause — shared by both of
  // the rejoin widget's floating-break notes below (mid-break "listen for
  // it," and next-break "starts sometime in the window"), since the
  // estimate math is identical and only the surrounding sentence differs.
  // Null when the story math gives no estimate for this float (no NPR
  // times this shift, or no boundary/spanning story found).
  const floatEstimateClause = (details: NonNullable<ReturnType<typeof floatDetailsForBreak>>): string | null => {
    const { atOffset, landing, boundaryTitle, spanningTitle } = details;
    if (landing?.basis === "story_boundary") {
      return `estimated at ~${atOffset(landing.offsetSeconds)}${boundaryTitle ? ` after "${boundaryTitle}"` : ""}`;
    }
    if (landing && spanningTitle) {
      return `"${spanningTitle}" is estimated to run through the whole window`;
    }
    return null;
  };

  const breakBoardBreaks: BreakBoardBreak[] = rundown.breaks.map((brk, breakIndex) => {
    const result = breakStatusesById.get(brk.id);
    const fit = result!.fit;
    const status = result!.status;
    const isCurrent = live && brk.id === currentBreakId;
    const floatHint = floatHintForBreak(brk);

    const statusBadge =
      status === "carrying_network" ? (
        <Badge variant="muted">Carrying network</Badge>
      ) : status === "unresolved_required" ? (
        <Badge variant="danger">Needs something</Badge>
      ) : status === "over" ? (
        <Badge variant="danger">{fit.overSeconds}s over</Badge>
      ) : status === "covered_by_previous" ? (
        <Badge variant="muted">
          Covered by {breakLabelById.get(result!.coveredByBreakId ?? "") ?? "the previous break"}
        </Badge>
      ) : status === "preempted_by_previous" ? (
        <Badge variant="warning">
          Preempted by {breakLabelById.get(result!.coveredByBreakId ?? "") ?? "the previous break"}
        </Badge>
      ) : (
        <Badge variant="success">{fit.remainingSeconds}s to spare</Badge>
      );

    const items: BreakBoardItem[] = brk.items.map((item) => {
      const copy = item.underwriting_copy_id ? copyById.get(item.underwriting_copy_id) : null;
      // A DAD-imported program promo carries its "Join us for X..." tag on
      // its live_outro component's own script, never on the item's
      // top-level script field — see componentScriptText's own comment.
      const contentComponentScript = item.contentItem ? componentScriptText(item.contentItem.components) : null;
      const effectiveScript =
        item.override_script ??
        item.contentItem?.script ??
        contentComponentScript ??
        copy?.script ??
        item.live_read_script ??
        (item.item_kind === "weather" ? (weather.reading?.live_read_text ?? null) : null);
      const masterDuration = item.contentItem
        ? computeTotalDurationSeconds(item.contentItem.components, item.contentItem.expected_duration_seconds)
        : null;
      const isOverridden =
        item.override_duration_seconds !== null ||
        item.override_script !== null ||
        item.override_live_intro_seconds !== null ||
        item.override_live_outro_seconds !== null ||
        item.override_tag_seconds !== null;
      // A credit card leads with WHO the credit is for — "Copy 2" alone
      // identifies nothing to a host on air; the underwriter name comes
      // from log_underwriters_for_copy (see listUnderwritingCopyForItems).
      const copyTitle = copy
        ? copy.underwriter_name
          ? `${copy.underwriter_name} — ${copy.label}`
          : copy.label
        : null;
      const title = item.contentItem?.title ?? item.live_read_title ?? copyTitle ?? "Weather";
      // Flags a look-ahead whose source story may no longer exist in the
      // current NPR episode data — a real, if rare, mid-broadcast story
      // substitution (see the migration's comment). Never auto-corrected;
      // just surfaced so a host can check it before airing.
      const nprSourceStale =
        item.source_npr_item_id !== null && !currentNprItemIds.has(item.source_npr_item_id);
      const confirmed = (eventCountByItem.get(item.id) ?? 0) > 0;
      const kind: RelocatableItemKind | "underwriting_credit" =
        item.item_kind === "content" || item.item_kind === "weather" || item.item_kind === "live_read"
          ? item.item_kind
          : "underwriting_credit";

      const itemTiming = itemTimingByBreakAndId.get(brk.id)?.get(item.id) ?? null;
      const startLabel = itemTiming ? formatStationClockTime(itemTiming.startAt) : null;

      // What the "Edit for this airing" form should prefill when this item
      // has no override yet — the un-overridden default it's currently
      // running with, so opening the form to tweak just one field doesn't
      // present as blank and silently drop the rest on save.
      const defaultScript =
        item.item_kind === "weather"
          ? (weather.reading?.live_read_text ?? null)
          : (item.contentItem?.script ?? contentComponentScript);
      const defaultDurationSeconds =
        item.item_kind === "weather" ? WEATHER_DEFAULT_DURATION_SECONDS : masterDuration;

      // One card layout, current break or not — the current break is
      // highlighted at the break level ("Live now", the highlight ring,
      // #current-break), and the sticky header's Text size control is the
      // one way copy gets bigger: it zooms the whole screen, so a special
      // larger-type view here (the old CopyDisplay, with its own separate
      // size buttons) was a second, confusingly independent size system.
      const readView = (
        <>
          {nprSourceStale && (
            <Badge variant="danger" className="mb-2">
              Source story may have changed — check before airing
            </Badge>
          )}
          <div className="min-w-0">
            {startLabel && (
              <p className="mb-1 font-mono text-base font-extrabold text-ink-900 tabular-nums">
                {startLabel}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {isOverridden && <Badge variant="warning">overridden for this airing</Badge>}
              <span className="text-base font-semibold text-ink-900">{title}</span>
            </div>
            {item.contentItem && (
              <div className="mt-0.5 text-xs text-ink-400">
                {CONTENT_TYPE_LABEL[item.contentItem.content_type]}
                {masterDuration !== null && ` · master ${masterDuration}s`}
              </div>
            )}
            {copy && (
              <div className="mt-0.5 text-xs text-ink-400">
                {copy.execution_kind === "recorded" ? `DAD cart ${copy.cart_identifier ?? "—"}` : "Live read"}
              </div>
            )}
            {item.item_kind === "weather" && weather.reading ? (
              <div className="mt-1.5">
                <ForecastSummary periods={getForecastPeriods(weather.reading)} fallbackText={effectiveScript ?? ""} />
              </div>
            ) : (
              <>
                {effectiveScript && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-700">{effectiveScript}</p>
                )}
                {!effectiveScript && item.contentItem?.summary && (
                  <p className="mt-1.5 text-sm text-ink-700">{item.contentItem.summary}</p>
                )}
              </>
            )}
            {item.item_kind === "weather" && weather.reading && (
              <div className="mt-2.5 rounded border border-line bg-panel-50 p-2.5">
                <WeatherOutlookStrip days={getDailyOutlook(weather.reading)} />
              </div>
            )}
          </div>
        </>
      );

      return {
        id: item.id,
        kind,
        contentType: (item.contentItem?.content_type as LogContentType | undefined) ?? null,
        // A credit stays draggable through a "missed" mark — that's the
        // recovery path, not a dead end — and only locks once it actually
        // airs. Ordinary content keeps the original "any event at all"
        // gate; nothing reacts to its outcome the way the credit/exception
        // pipeline does.
        draggable: kind === "underwriting_credit" ? !airedItemIds.has(item.id) : !confirmed,
        label: title,
        cardProps: {
          rundownId: rundown.id,
          itemId: item.id,
          title,
          durationSeconds: itemDuration(item),
          editable: item.item_kind === "content" || item.item_kind === "weather",
          // An imported rundown's credits have no placement behind them, so
          // the host can remove one (removeRundownItem routes credits
          // through log_delete_unplaced_credit_item(), which refuses any
          // placement-backed credit — those clear from Underwriting).
          removable: item.item_kind !== "underwriting_credit" || rundown.source === "imported",
          overrideScript: item.override_script,
          overrideDurationSeconds: item.override_duration_seconds,
          defaultScript,
          defaultDurationSeconds,
          updateItemOverridesAction: updateItemOverrides,
          removeRundownItemAction: removeRundownItem,
          midBroadcastActions: renderMidBroadcastActions(item, brk.scheduled_at),
          readView,
        },
      };
    });

    return {
      id: brk.id,
      rundownId: rundown.id,
      scheduledAt: brk.scheduled_at,
      label: `${formatStationClockTime(brk.scheduled_at)} — ${brk.label}`,
      permittedContentTypes: brk.permitted_content_types,
      isCurrent,
      headerNode: (
        <>
          <div
            className={`flex flex-wrap items-center gap-2.5 bg-panel-50 px-5 py-3 ${floatHint ? "" : "border-b border-line"}`}
          >
            {isCurrent && <Badge variant="warning">Live now</Badge>}
            <span className="font-mono text-base font-bold text-ink-900 tabular-nums">
              {formatStationClockTime(brk.scheduled_at)}
            </span>
            <span className="text-base font-semibold text-ink-900">{brk.label}</span>
            <Badge variant={brk.requirement === "required" ? "warning" : "neutral"}>{brk.requirement}</Badge>
            <span className="ml-auto text-sm text-ink-500">
              Rejoin network by {formatStationClockTime(brk.network_rejoin_at)} · {brk.available_duration_seconds}s
              available
            </span>
          </div>
          {floatHint}
        </>
      ),
      statusNode: (
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          {statusBadge}
          {status === "carrying_network" && (
            <span className="text-xs text-ink-400">
              Nothing placed — the network feed simply continues. That&apos;s fine.
            </span>
          )}
          {status === "covered_by_previous" && (
            <span className="text-xs text-ink-400">
              Nothing placed here, but the content in {breakLabelById.get(result!.coveredByBreakId ?? "") ??
                "the previous break"}{" "}
              runs long enough to cover this window too. Still open if you&apos;d rather place something
              here instead.
            </span>
          )}
          {status === "preempted_by_previous" && (
            <span className="text-xs text-ink-700">
              Network content here got bumped by an accident of timing — the content in{" "}
              {breakLabelById.get(result!.coveredByBreakId ?? "") ?? "the previous break"} ran longer than
              its own window and reached into this one. Nobody deliberately chose to skip this. Still open
              if you&apos;d rather place something here instead.
            </span>
          )}
        </div>
      ),
      insertConfig: buildInsertConfig(brk, breakIndex),
      items,
    };
  });

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
        {summary.preemptedBreaks > 0 && (
          <Badge variant="warning">
            {summary.preemptedBreaks} preempting network content — review
          </Badge>
        )}
      </div>

      {missingBreakCount > 0 && (
        <Alert variant="note" className="mb-4">
          {rundown.source === "imported" ? (
            <>
              The imported program log doesn&apos;t mention{" "}
              {missingBreakCount === 1
                ? "one of this clock's local windows"
                : `${missingBreakCount} of this clock's local windows`}
              , so {missingBreakCount === 1 ? "it isn't" : "they aren't"} showing below.
            </>
          ) : (
            <>
              This rundown was generated before{" "}
              {missingBreakCount === 1 ? "an opportunity" : "some opportunities"}{" "}
              {missingBreakCount === 1 ? "was" : "were"} added to this clock, so{" "}
              {missingBreakCount === 1 ? "it isn't" : "they aren't"} showing below.
            </>
          )}{" "}
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
        <RundownBreaksBoard
          breaks={breakBoardBreaks}
          live={live}
          nowISO={now}
          relocateItem={relocateRundownItem}
          relocateCredit={relocateUnderwritingCredit}
        />
      )}
    </>
  );

  // A break counts as actually airing local content only if it holds an
  // item of its own or is receiving spillover from an overrunning break
  // before it (covered_by_previous/preempted_by_previous) — an empty break
  // ('carrying_network' when optional, 'unresolved_required' when required
  // and still needs something) means the network feed is what's really on
  // the air right now, regardless of whether the plan nominally has this
  // break as "current."
  const hasLocalContent = (breakId: string): boolean => {
    const status = breakStatusesById.get(breakId)?.status;
    return status !== "carrying_network" && status !== "unresolved_required";
  };

  // What the sidebar's rejoin widget actually points at — distinct
  // situations that read very differently to a host mid-broadcast, but
  // used to render under one static "Network rejoin" heading with a wall-
  // clock time regardless of which one applied. Two confusions this fixes:
  // once local content ends and the network feed is carrying the show, the
  // widget used to still say "Network rejoin" and point at the *next*
  // break's own eventual end — a number that only makes sense once already
  // inside that break; and a break that's merely nominally "current" by the
  // clock but has nothing placed in it (carrying network, or a required
  // break not yet filled) used to trigger the same "Network rejoin"
  // framing as a break that's actually airing something, even though
  // nothing local is on the air either way. Both read the same
  // hasLocalContent check above, walking forward through any number of
  // consecutive empty breaks — a run of unused optional local avails is
  // real and shouldn't each get their own "next break" moment — to the
  // next one that's genuinely planned. A live countdown (Countdown,
  // ticking client-side) is the headline number throughout, with the
  // actual clock time as a secondary line — "how long" reads faster at a
  // glance during a broadcast than "what time," per direct feedback.
  const rejoinDisplay = (() => {
    const currentBreak = timing?.currentBreak ?? null;
    const currentIndex = currentBreak ? rundown.breaks.findIndex((brk) => brk.id === currentBreak.id) : -1;

    if (live && currentIndex !== -1 && hasLocalContent(rundown.breaks[currentIndex]!.id)) {
      const { rejoinAt, runsThroughLabel, finalBreakId } = effectiveRejoin(rundown.breaks[currentIndex]!.id);
      // The float note applies to whichever break the rejoin time actually
      // names — the end of a covered chain, when there is one, not
      // necessarily the current break itself.
      const floatDetails = finalBreakId ? floatDetailsForBreak(finalBreakId) : null;
      const clause = floatDetails ? floatEstimateClause(floatDetails) : null;
      const caption = floatDetails
        ? `Floating break${clause ? ` — ${clause}` : ""}.`
        : runsThroughLabel
          ? `The current break's content is planned to run through ${runsThroughLabel}'s window — back to the network feed after that.`
          : "When the current break ends — back to the network feed.";
      return { heading: "Network rejoin", targetISO: rejoinAt, caption, dangerWhenPast: floatDetails === null };
    }

    if (live) {
      // On the network feed right now — either nothing has nominally
      // started yet, or the break that has is empty. Either way, walk
      // forward from here for the next break that actually has content
      // planned, which might be several breaks ahead.
      const searchFrom = currentIndex === -1 ? 0 : currentIndex + 1;
      const nextFilled = rundown.breaks.slice(searchFrom).find((brk) => hasLocalContent(brk.id));
      if (nextFilled) {
        const floatDetails = floatDetailsForBreak(nextFilled.id);
        const clause = floatDetails ? floatEstimateClause(floatDetails) : null;
        const label = breakLabelById.get(nextFilled.id) ?? "The next break";
        const caption = floatDetails
          ? `Floating break — starts sometime in ${floatDetails.windowLabel}${clause ? `; ${clause}` : ""}.`
          : `${label} — on the network feed until then.`;
        return {
          heading: "Next break",
          targetISO: nextFilled.scheduled_at,
          caption,
          dangerWhenPast: floatDetails === null,
        };
      }
    }

    return {
      heading: "Network rejoin",
      targetISO: rundown.shift_end_at,
      caption: `End of this shift${live ? " — no more local content planned" : ""}.`,
      dangerWhenPast: false,
    };
  })();

  const sidebarContent = (
    <>
      <StationClock />

      <div className="rounded border border-line p-4">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
          {rejoinDisplay.heading}
        </div>
        <p className="font-mono text-2xl font-extrabold tabular-nums text-ink-900">
          <Countdown targetISO={rejoinDisplay.targetISO} dangerWhenPast={rejoinDisplay.dangerWhenPast} />
        </p>
        <p className="mt-0.5 font-mono text-xs text-ink-400 tabular-nums">
          {formatStationClockTime(rejoinDisplay.targetISO)}
        </p>
        <p className="mt-1 text-xs text-ink-400">{rejoinDisplay.caption}</p>
      </div>

      <div className="rounded border border-line p-4">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Weather</div>
        {weather.reading ? (
          <>
            {/* Above the fold: what a host glances at mid-broadcast — the
                current observation ("72° Partly Cloudy", best-effort from
                the NWS station feed, forecast conditions as the fallback),
                today's high/low, and the condensed forecast line, right
                above the disclosure so a host sees today's outlook without
                opening it. Everything longer, including the full live-read
                text and the several-day outlook, stays behind Full
                forecast. */}
            <p className="text-lg font-bold text-ink-900">
              {weather.reading.current_temp !== null && (
                <span className="font-mono tabular-nums">{weather.reading.current_temp}° </span>
              )}
              {weather.reading.current_conditions ?? weather.reading.condensed_text}
            </p>
            {(weather.reading.high_temp !== null || weather.reading.low_temp !== null) && (
              <p className="mt-0.5 text-sm text-ink-700">
                {weather.reading.high_temp !== null && `High ${weather.reading.high_temp}°`}
                {weather.reading.high_temp !== null && weather.reading.low_temp !== null && " · "}
                {weather.reading.low_temp !== null && `Low ${weather.reading.low_temp}°`}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-400">
              Updated {formatStationTimestamp(weather.reading.last_updated_at)}
              {weather.stale && " · stale"}
            </p>
            <p className="mt-1.5 text-sm text-ink-700">{weather.reading.condensed_text}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                Full forecast
              </summary>
              <div className="mt-2 flex flex-col gap-1.5 text-xs text-ink-700">
                {weather.reading.precipitation_notes && <p>{weather.reading.precipitation_notes}</p>}
                {weather.reading.hazards && (
                  <p className="font-semibold text-danger">{weather.reading.hazards}</p>
                )}
                <div className="border-t border-line pt-1.5">
                  <ForecastSummary
                    periods={getForecastPeriods(weather.reading)}
                    fallbackText={weather.reading.live_read_text}
                    textClassName="text-xs"
                  />
                </div>
                <p className="text-ink-400">
                  Valid through {formatStationTimestamp(weather.reading.valid_through_at)}
                </p>
                <div className="border-t border-line pt-1.5">
                  <WeatherOutlookStrip days={getDailyOutlook(weather.reading)} />
                </div>
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
        {npr?.kind === "found" && sidebarNprStories.length > 0 ? (
          <>
            {sidebarNprHeading && <p className="mb-2 text-xs text-ink-400">{sidebarNprHeading}</p>}
            <ul className="flex flex-col gap-2">
              {/* The teaser (CDS's longer editorial description) is what a
                  host actually forward-promotes from, so it leads here; the
                  short headline only stands in when a story has none. */}
              {sidebarNprStories.map((item) => (
                <li key={item.npr_item_id} className="text-xs text-ink-700">
                  {item.estimatedTimeLabel && (
                    <span className="mr-1.5 font-mono text-ink-400 tabular-nums">
                      {item.estimatedTimeLabel}
                    </span>
                  )}
                  {item.teaser?.trim() ? (
                    item.teaser
                  ) : (
                    <span className="font-semibold">{item.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : npr?.kind === "found" ? (
          <p className="text-xs text-ink-400">
            {hasStoryTimes
              ? `No more stories estimated for this shift.`
              : `CDS returned this episode with no story items yet.`}
          </p>
        ) : npr?.kind === "unmapped" || npr?.kind === "not_configured" ? (
          <p className="text-xs text-ink-400">Not available for this program.</p>
        ) : npr?.kind === "error" ? (
          // A real fetch failure, not just "nothing yet" — hiding the message
          // here once masked a broken CDS integration as an empty panel.
          <p className="text-xs text-danger">Couldn&apos;t fetch NPR data. ({npr.message})</p>
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
                {unresolvedEntries.length} thing{unresolvedEntries.length === 1 ? "" : "s"} still need
                an underwriting credit confirmed, or content for a required break. Ordinary content is
                never counted here — see below.
              </p>
            )}

            {underwritingItems.length > 0 && (
              <div className="mb-3 rounded border border-line bg-panel-50 p-3">
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                  Underwriting credits
                </div>
                {unconfirmedUnderwritingCount > 0 && (
                  <>
                    <p className="mb-2 text-xs text-ink-700">
                      {unconfirmedUnderwritingCount} credit{unconfirmedUnderwritingCount === 1 ? "" : "s"}{" "}
                      haven&apos;t been confirmed one way or the other. Attesting marks all of them
                      aired as scheduled — never anything already recorded as aired or missed.
                    </p>
                    <form action={attestUnderwritingCredits}>
                      <input type="hidden" name="rundown_id" value={rundown.id} />
                      <Button type="submit" variant="secondary" className="px-2.5 py-1.5 text-xs">
                        Attest {unconfirmedUnderwritingCount} aired as scheduled
                      </Button>
                    </form>
                  </>
                )}
                {hasOpenExceptions && (
                  <Alert variant="danger" className={unconfirmedUnderwritingCount > 0 ? "mt-3" : undefined}>
                    This rundown has an unresolved underwriting exception. Submission is blocked
                    until it&apos;s resolved in Underwriting &amp; Traffic — a makegood, an accepted
                    alternate, or a waiver.
                  </Alert>
                )}
                {unconfirmedUnderwritingCount === 0 && !hasOpenExceptions && (
                  <p className="text-xs text-ink-500">Every credit is confirmed or resolved.</p>
                )}
              </div>
            )}

            {unconfirmedOrdinaryCount > 0 && (
              <div className="mb-3 rounded border border-line bg-panel-50 p-3">
                <p className="mb-2 text-xs text-ink-700">
                  {unconfirmedOrdinaryCount} other item{unconfirmedOrdinaryCount === 1 ? "" : "s"}{" "}
                  haven&apos;t been confirmed aired — entirely optional, submitting doesn&apos;t need
                  this. Marking them helps keep a complete record.
                </p>
                <form action={attestOrdinaryContentAired}>
                  <input type="hidden" name="rundown_id" value={rundown.id} />
                  <Button type="submit" variant="secondary" className="px-2.5 py-1.5 text-xs">
                    Mark {unconfirmedOrdinaryCount} aired as scheduled
                  </Button>
                </form>
              </div>
            )}

            <form action={submitRundown}>
              <input type="hidden" name="rundown_id" value={rundown.id} />
              <Button
                type="submit"
                variant={rundown.status === "submitted" ? "secondary" : "primary"}
                disabled={hasOpenExceptions}
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
