import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { getRundownDetail, listBroadcastEventsForItems, listUnderwritingCopyForItems } from "@/lib/log/queries";
import { computeLiveTimingState, type ConsoleBreakLike, type LiveTimingState } from "@/lib/log/console-timing";
import { listValidMoveDestinations, type MoveDestinationBreakLike } from "@/lib/log/mid-broadcast";
import { listUnresolvedEntries } from "@/lib/log/submission";
import { getCurrentWeatherReading } from "@/lib/log/weather";
import { getNprEpisodeForProgramOnDate } from "@/lib/log/npr";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { LogPoller } from "../../../log-poller";
import { markAired, markMissed, moveRundownItem, startConsole, submitRundown } from "../../../console-actions";
import { CopyDisplay } from "./copy-display";
import type { LogContentType, LogMissReason } from "@/lib/database.types";

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

export default async function ConsolePage({
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

  if (rundown.status === "draft" || rundown.status === "generated") {
    return (
      <div className="max-w-md rounded border border-line p-6">
        <p className="mb-4 text-sm text-ink-700">
          This rundown hasn&apos;t been started yet. Starting the console marks it in progress.
        </p>
        {error && <Alert className="mb-4">{error}</Alert>}
        <form action={startConsole}>
          <input type="hidden" name="rundown_id" value={rundown.id} />
          <Button type="submit">Start console</Button>
        </form>
      </div>
    );
  }

  const now = new Date().toISOString();
  const allItems = rundown.breaks.flatMap((brk) => brk.items);
  const events = await listBroadcastEventsForItems(allItems.map((item) => item.id));
  const eventCountByItem = new Map<string, number>();
  for (const event of events) {
    eventCountByItem.set(event.rundown_item_id, (eventCountByItem.get(event.rundown_item_id) ?? 0) + 1);
  }
  const underwritingCopyIds = [...new Set(allItems.flatMap((item) => (item.underwriting_copy_id ? [item.underwriting_copy_id] : [])))];
  const copyById = new Map((await listUnderwritingCopyForItems(underwritingCopyIds)).map((copy) => [copy.id, copy]));

  const consoleBreaks: ConsoleBreakLike[] = rundown.breaks.map((brk) => ({
    id: brk.id,
    scheduled_at: brk.scheduled_at,
    network_rejoin_at: brk.network_rejoin_at,
    requirement: brk.requirement,
    itemCount: brk.items.length,
    allItemsConfirmed: brk.items.length > 0 && brk.items.every((item) => (eventCountByItem.get(item.id) ?? 0) > 0),
  }));

  const timing = computeLiveTimingState(now, consoleBreaks, rundown.shift_end_at);
  const currentBreak = rundown.breaks.find((brk) => brk.id === timing.currentBreak?.id) ?? null;
  const nextBreak = rundown.breaks.find((brk) => brk.id === timing.nextBreak?.id) ?? null;

  const destinationBreaks: MoveDestinationBreakLike[] = rundown.breaks.map((brk) => ({
    id: brk.id,
    scheduled_at: brk.scheduled_at,
    permitted_content_types: brk.permitted_content_types,
    allow_multiple: brk.allow_multiple,
    item_count: brk.items.length,
  }));

  const [weather, npr] = await Promise.all([
    getCurrentWeatherReading(),
    getNprEpisodeForProgramOnDate(rundown.program_id, rundown.air_date),
  ]);

  const unresolvedEntries = listUnresolvedEntries(
    rundown.breaks.map((brk) => ({ id: brk.id, requirement: brk.requirement, itemIds: brk.items.map((item) => item.id) })),
    new Set(eventCountByItem.keys()),
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <LogPoller intervalMs={15000} />
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <Link href={`/log/rundowns/${rundown.id}`} className="text-xs font-semibold text-brand-link">
            ← Builder
          </Link>
          <h2 className="font-serif text-xl font-bold text-ink-900">{rundown.programName}</h2>
          <Badge variant={STATE_VARIANT[timing.state]}>{STATE_LABEL[timing.state]}</Badge>
          {rundown.status === "submitted" && <Badge variant="success">Submitted</Badge>}
        </div>

        {error && <Alert className="mb-4">{error}</Alert>}
        {moved_from && moved_to && (
          <Alert variant="info" className="mb-4">
            <div className="flex items-center justify-between gap-3">
              <span>Moved.</span>
              <form action={moveRundownItem}>
                <input type="hidden" name="rundown_id" value={rundown.id} />
                <input type="hidden" name="source_item_id" value={moved_to} />
                <input type="hidden" name="destination_break_id" value={currentBreak?.id ?? ""} />
                <Button type="submit" variant="ghost">
                  Dismiss
                </Button>
              </form>
            </div>
          </Alert>
        )}

        <div className="rounded border border-line p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-ink-400">
            <span>Current — {currentBreak?.label ?? "—"}</span>
            {currentBreak && (
              <span>
                {formatStationTimestamp(currentBreak.scheduled_at)} · rejoin by{" "}
                {formatStationTimestamp(currentBreak.network_rejoin_at)}
              </span>
            )}
          </div>

          {!currentBreak ? (
            <p className="text-sm text-ink-500">Nothing scheduled right now.</p>
          ) : currentBreak.items.length === 0 ? (
            currentBreak.requirement === "required" ? (
              <div>
                <p className="text-lg font-bold text-danger">{currentBreak.label} — empty</p>
                <p className="mt-1 text-xs text-ink-500">
                  This is a required local obligation with nothing placed.{" "}
                  <Link href={`/log/rundowns/${rundown.id}`} className="font-semibold text-brand-link">
                    Fill it in the builder
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-500">Carrying network — nothing placed here, and that&apos;s fine.</p>
            )
          ) : (
            <div className="flex flex-col gap-4">
              {currentBreak.items.map((item) => {
                const copy = item.underwriting_copy_id ? copyById.get(item.underwriting_copy_id) : null;
                const confirmed = (eventCountByItem.get(item.id) ?? 0) > 0;
                const title = item.contentItem?.title ?? item.live_read_title ?? copy?.label ?? "Weather";
                const script = item.override_script ?? item.contentItem?.script ?? copy?.script ?? item.live_read_script;
                const summary = item.contentItem?.summary ?? null;
                const moveDestinations =
                  item.item_kind === "content" && item.contentItem
                    ? listValidMoveDestinations(
                        destinationBreaks,
                        currentBreak.id,
                        item.contentItem.content_type as LogContentType,
                        now,
                      )
                    : [];

                return (
                  <div key={item.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                    <CopyDisplay title={title} script={script} summary={summary} />
                    {!confirmed && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <form action={markAired}>
                          <input type="hidden" name="rundown_id" value={rundown.id} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <Button type="submit">Aired</Button>
                        </form>

                        <details className="inline-block">
                          <summary className="inline-flex cursor-pointer items-center rounded border border-line px-4 py-2.5 text-sm font-bold text-ink-700">
                            Missed
                          </summary>
                          <form action={markMissed} className="mt-2 flex flex-col gap-2 rounded border border-line p-3">
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
                            <summary className="inline-flex cursor-pointer items-center rounded border border-line px-4 py-2.5 text-sm font-bold text-ink-700">
                              Move
                            </summary>
                            <form action={moveRundownItem} className="mt-2 flex flex-col gap-2 rounded border border-line p-3">
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 rounded border border-dashed border-line p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Next</div>
          {!nextBreak ? (
            <p className="text-sm text-ink-500">Nothing else scheduled.</p>
          ) : (
            <p className="text-sm text-ink-700">
              {formatStationTimestamp(nextBreak.scheduled_at)} — {nextBreak.label}{" "}
              {nextBreak.items.length === 0 ? (
                nextBreak.requirement === "required" ? (
                  <span className="text-danger">still needs something</span>
                ) : (
                  <span className="text-ink-400">carrying network</span>
                )
              ) : (
                <span className="text-ink-400">
                  {nextBreak.items.map((item) => item.contentItem?.title ?? item.live_read_title ?? "underwriting credit").join(", ")}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
        <div className="rounded border border-line p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Network rejoin</div>
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
            </>
          ) : (
            <p className="text-xs text-ink-400">No reading yet.</p>
          )}
        </div>

        <div className="rounded border border-line p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">NPR — coming up</div>
          {npr.kind === "found" && npr.items.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {npr.items.slice(0, 4).map((item) => (
                <li key={item.id} className="text-xs text-ink-700">
                  <span className="font-semibold">{item.title}</span>
                </li>
              ))}
            </ul>
          ) : npr.kind === "unmapped" || npr.kind === "not_configured" ? (
            <p className="text-xs text-ink-400">Not available for this program.</p>
          ) : (
            <p className="text-xs text-ink-400">No episode data yet.</p>
          )}
        </div>

        <div className="rounded border border-line p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Wrap up</span>
            {unresolvedEntries.length > 0 && <Badge variant="warning">{unresolvedEntries.length} unresolved</Badge>}
          </div>
          {unresolvedEntries.length > 0 && (
            <p className="mb-3 text-xs text-ink-500">
              {unresolvedEntries.length} thing{unresolvedEntries.length === 1 ? "" : "s"} still need an aired,
              missed, or moved outcome — or content for a required break. Submitting doesn&apos;t require
              resolving them first.
            </p>
          )}
          <form action={submitRundown}>
            <input type="hidden" name="rundown_id" value={rundown.id} />
            <Button type="submit" variant={rundown.status === "submitted" ? "secondary" : "primary"}>
              {rundown.status === "submitted" ? "Re-submit" : "Submit rundown"}
            </Button>
          </form>
          {rundown.status === "submitted" && rundown.submitted_at && (
            <p className="mt-2 text-xs text-ink-400">
              Submitted {formatStationTimestamp(rundown.submitted_at)}. Corrections still work above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
