import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import { getRundownDetail, listBroadcastEventsForItems } from "@/lib/log/queries";
import { computeLiveTimingState, type ConsoleItemLike, type LiveTimingState } from "@/lib/log/console-timing";
import { listValidMoveDestinations } from "@/lib/log/mid-broadcast";
import { listUnresolvedItems } from "@/lib/log/submission";
import { getCurrentWeatherReading } from "@/lib/log/weather";
import { getNprEpisodeForProgramOnDate } from "@/lib/log/npr";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { LogPoller } from "../../../log-poller";
import { markAired, markMissed, moveRundownItem, startConsole, submitRundown } from "../../../console-actions";
import { CopyDisplay } from "./copy-display";
import type { LogMissReason } from "@/lib/database.types";

const STATE_LABEL: Record<LiveTimingState, string> = {
  on_time: "On time",
  running_long: "Running long",
  running_short: "Running short",
  at_risk_required: "At risk — required item coming up",
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
  const events = await listBroadcastEventsForItems(rundown.items.map((item) => item.id));
  const eventCountByItem = new Map<string, number>();
  for (const event of events) {
    eventCountByItem.set(event.rundown_item_id, (eventCountByItem.get(event.rundown_item_id) ?? 0) + 1);
  }

  const consoleItems: ConsoleItemLike[] = rundown.items.map((item) => ({
    id: item.id,
    scheduled_at: item.scheduled_at,
    planned_duration_seconds: item.planned_duration_seconds,
    requirement_level: item.requirement_level,
    confirmed: (eventCountByItem.get(item.id) ?? 0) > 0,
  }));

  const timing = computeLiveTimingState(now, consoleItems, rundown.shift_end_at);
  const currentItem = rundown.items.find((item) => item.id === timing.currentItem?.id) ?? null;
  const nextItem = rundown.items.find((item) => item.id === timing.nextItem?.id) ?? null;
  const currentIsFilled =
    currentItem != null && (currentItem.content_item_id !== null || currentItem.underwriting_copy_id !== null);

  const moveDestinations =
    currentItem?.contentItem != null
      ? listValidMoveDestinations(
          rundown.items.map((item) => ({
            id: item.id,
            content_item_id: item.content_item_id,
            underwriting_copy_id: item.underwriting_copy_id,
            scheduled_at: item.scheduled_at,
            slot: item.slot,
          })),
          currentItem.id,
          currentItem.contentItem.content_type,
          now,
        )
      : [];
  const moveDestinationById = new Map(rundown.items.map((item) => [item.id, item]));

  const [weather, npr] = await Promise.all([
    getCurrentWeatherReading(),
    getNprEpisodeForProgramOnDate(rundown.program_id, rundown.air_date),
  ]);

  const unresolvedItems = listUnresolvedItems(
    rundown.items.map((item) => ({
      id: item.id,
      content_item_id: item.content_item_id,
      underwriting_copy_id: item.underwriting_copy_id,
      requirement_level: item.requirement_level,
    })),
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
                <input type="hidden" name="destination_item_id" value={moved_from} />
                <Button type="submit" variant="ghost">
                  Undo
                </Button>
              </form>
            </div>
          </Alert>
        )}

        <div className="rounded border border-line p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-ink-400">
            <span>Current</span>
            {currentItem && (
              <span>
                {formatStationTimestamp(currentItem.scheduled_at)} · {currentItem.slot.duration_seconds}s
              </span>
            )}
          </div>

          {!currentItem ? (
            <p className="text-sm text-ink-500">Nothing scheduled right now.</p>
          ) : currentItem.underwriting_copy_id ? (
            <CopyDisplay
              title="Underwriting credit"
              script={null}
              summary="Managed from Underwriting & Traffic — see that tool for the script."
            />
          ) : !currentItem.contentItem ? (
            <div>
              <p className="text-lg font-bold text-danger">
                {currentItem.slot.label ?? "Local break"} — empty
              </p>
              <p className="mt-1 text-xs text-ink-500">
                This slot has no content assigned.{" "}
                <Link href={`/log/rundowns/${rundown.id}`} className="font-semibold text-brand-link">
                  Fill it in the builder
                </Link>
                .
              </p>
            </div>
          ) : (
            <CopyDisplay
              title={currentItem.contentItem.title}
              script={currentItem.contentItem.script}
              summary={currentItem.contentItem.summary}
            />
          )}

          {currentIsFilled && currentItem && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              <form action={markAired}>
                <input type="hidden" name="rundown_id" value={rundown.id} />
                <input type="hidden" name="item_id" value={currentItem.id} />
                <Button type="submit">Aired</Button>
              </form>

              <details className="inline-block">
                <summary className="inline-flex cursor-pointer items-center rounded border border-line px-4 py-2.5 text-sm font-bold text-ink-700">
                  Missed
                </summary>
                <form action={markMissed} className="mt-2 flex flex-col gap-2 rounded border border-line p-3">
                  <input type="hidden" name="rundown_id" value={rundown.id} />
                  <input type="hidden" name="item_id" value={currentItem.id} />
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
                    <input type="hidden" name="source_item_id" value={currentItem.id} />
                    <Select name="destination_item_id" required defaultValue="">
                      <option value="" disabled>
                        Choose an opening…
                      </option>
                      {moveDestinations.map((destination) => {
                        const full = moveDestinationById.get(destination.id);
                        return (
                          <option key={destination.id} value={destination.id}>
                            {formatStationTimestamp(destination.scheduled_at)} — {full?.slot.label ?? "Local break"}
                          </option>
                        );
                      })}
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

        <div className="mt-4 rounded border border-dashed border-line p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Next</div>
          {!nextItem ? (
            <p className="text-sm text-ink-500">Nothing else scheduled.</p>
          ) : (
            <p className="text-sm text-ink-700">
              {formatStationTimestamp(nextItem.scheduled_at)} —{" "}
              {nextItem.underwriting_copy_id ? (
                <span className="text-ink-400">Underwriting credit</span>
              ) : nextItem.contentItem ? (
                <>
                  {nextItem.contentItem.title}{" "}
                  <span className="text-ink-400">({CONTENT_TYPE_LABEL[nextItem.contentItem.content_type]})</span>
                </>
              ) : (
                <span className="text-danger">{nextItem.slot.label ?? "Local break"} — empty</span>
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
            {unresolvedItems.length > 0 && <Badge variant="warning">{unresolvedItems.length} unresolved</Badge>}
          </div>
          {unresolvedItems.length > 0 && (
            <p className="mb-3 text-xs text-ink-500">
              {unresolvedItems.length} item{unresolvedItems.length === 1 ? "" : "s"} still need an aired, missed,
              or moved outcome — or content for a required slot. Submitting doesn&apos;t require resolving them
              first.
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
