import Link from "next/link";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireLogAccess } from "@/lib/log/access";
import { automatedSegments, stationLocalParts } from "@/lib/log/automated-hours";
import { loadAutomatedHours } from "@/lib/log/automated-hours-queries";
import {
  formatDadRow,
  formatDadTime,
  hasBlockingIssues,
  previewRowsFromEvents,
  type DadIssue,
} from "@/lib/log/dad-export";
import { isReleaseCurrent, loadDadDay } from "@/lib/log/dad-export-queries";
import {
  formatStationDateLong,
  formatStationTimestamp,
  shiftDateISO,
  stationTodayISO,
} from "@/lib/log/timezone";
import { isValidDateISO } from "@/lib/log/week-layout";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { releaseDadLog } from "./actions";

const NAV_LINK =
  "inline-flex shrink-0 items-center rounded border border-line px-2.5 py-1.5 text-xs font-bold text-ink-700 hover:bg-panel-100";

/**
 * The DAD log for one day (lib/log/dad-export.ts): the credits DAD plays in
 * automated hours, what stops them from playing, the exact file, and its
 * releases. Producers release; every Log member can read and download.
 */
export default async function DadLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; show?: string; error?: string; released?: string }>;
}) {
  const params = await searchParams;
  const { isProducer } = await requireLogAccess();
  const today = stationTodayISO();
  const date = isValidDateISO(params.date) ? params.date : today;
  const showFile = params.show === "file";

  const [day, hours] = await Promise.all([loadDadDay(date), loadAutomatedHours()]);
  const segments = automatedSegments(date, hours.weekly, hours.changes).filter((s) => s.automated);
  const blocking = day.issues.filter((issue) => issue.severity === "blocking");
  const warnings = day.issues.filter((issue) => issue.severity === "warning");
  const latest = day.releases[0] ?? null;
  const current = isReleaseCurrent(day);
  const nextVersion = (latest?.version ?? 0) + 1;
  const releaserNames = await namesFor(day.releases.map((release) => release.released_by));

  const href = (extra: Record<string, string>) =>
    `/log/dad-log?${new URLSearchParams({ date, ...extra }).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href={`/log?date=${date}`}
          className="text-sm font-semibold text-brand-link hover:underline"
        >
          ← Today
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-900">
              DAD log · {formatStationDateLong(date)}
            </h1>
            <p className="text-sm text-ink-500">
              The credits DAD plays in automated hours. Nothing else is in the file.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={href({ date: shiftDateISO(date, -1) })} className={NAV_LINK}>
              ← Prev day
            </Link>
            <Link href={href({ date: shiftDateISO(date, 1) })} className={NAV_LINK}>
              Next day →
            </Link>
          </div>
        </div>
      </div>

      {params.error && <Alert>{params.error}</Alert>}
      {params.released && /^\d+$/.test(params.released) && (
        <Alert variant="success">
          Released v{params.released}. Download it and put it in DAD&apos;s import folder.
        </Alert>
      )}

      <DayStrip date={date} segments={segments} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {segments.length === 0 && (
            <Alert variant="note">
              Every hour on this day is hosted, so there&apos;s nothing for DAD to play.{" "}
              <Link href="/log/automated-hours" className="font-bold text-brand-link">
                Automated hours
              </Link>
            </Alert>
          )}
          {blocking.length > 0 && (
            <IssueList
              title={`${blocking.length} ${blocking.length === 1 ? "item can't" : "items can't"} play from DAD`}
              issues={blocking}
              tone="danger"
            />
          )}
          {warnings.length > 0 && <IssueList title="Worth knowing" issues={warnings} tone="note" />}

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-bold text-ink-900">
                What DAD will play · {day.events.length}{" "}
                {day.events.length === 1 ? "item" : "items"}
              </h2>
              <span className="flex-1" />
              <nav
                aria-label="Show"
                className="inline-flex overflow-hidden rounded border border-line"
              >
                <Link
                  href={href({})}
                  aria-current={!showFile ? "page" : undefined}
                  className={cn(
                    "px-3.5 py-1.5 text-[13px] font-bold",
                    !showFile ? "bg-brand-link text-white" : "bg-white text-ink-900",
                  )}
                >
                  Table
                </Link>
                <Link
                  href={href({ show: "file" })}
                  aria-current={showFile ? "page" : undefined}
                  className={cn(
                    "border-l border-line px-3.5 py-1.5 text-[13px] font-bold",
                    showFile ? "bg-brand-link text-white" : "bg-white text-ink-900",
                  )}
                >
                  File
                </Link>
              </nav>
            </div>

            {day.events.length === 0 ? (
              <div className="rounded border border-dashed border-line p-6 text-sm text-ink-500">
                Nothing is placed in this day&apos;s automated breaks.
              </div>
            ) : showFile ? (
              <pre className="overflow-x-auto rounded border border-line bg-panel-50 p-3 font-mono text-[11px] leading-5 text-ink-900">
                {previewRowsFromEvents(day.events)
                  .map((row) => formatDadRow(row).trimEnd())
                  .join("\n")}
              </pre>
            ) : (
              <TableFrame>
                <Table stack>
                  <thead>
                    <HeaderRow>
                      <Th>Time</Th>
                      <Th>Cut</Th>
                      <Th>Item</Th>
                      <Th>Program</Th>
                      <Th>Length</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {day.events.map((event) => (
                      <Row key={event.itemId}>
                        <Cell stack="title" className="whitespace-nowrap tabular-nums">
                          {formatDadTime(event.time)}
                        </Cell>
                        <Cell label="Cut" className="font-mono">
                          {event.cut ?? <Badge variant="danger">No cut</Badge>}
                        </Cell>
                        <Cell label="Item">{event.description}</Cell>
                        <Cell label="Program">
                          <Link
                            href={`/log/rundowns/${event.rundownId}`}
                            className="text-brand-link hover:underline"
                          >
                            {event.programName}
                          </Link>
                        </Cell>
                        <Cell label="Length" className="tabular-nums">
                          {event.durationSeconds}s
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
            )}
            <p className="text-[13px] text-ink-500">Times are Central.</p>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded border border-line p-4">
            <h2 className="text-sm font-bold text-ink-900">Release</h2>
            {latest && current === false && (
              <Alert variant="warning">
                v{latest.version} is out of date. A rundown changed after it was released{" "}
                {formatStationTimestamp(latest.released_at)}.
              </Alert>
            )}
            {latest && current === true && (
              <p className="text-sm text-ink-700">v{latest.version} matches the rundowns.</p>
            )}
            {isProducer && (latest === null || current === false) && (
              <form action={releaseDadLog} className="flex flex-col gap-1.5">
                <input type="hidden" name="date" value={date} />
                <Button
                  type="submit"
                  disabled={hasBlockingIssues(day.issues) || day.events.length === 0}
                >
                  Release v{nextVersion}
                </Button>
                {hasBlockingIssues(day.issues) && (
                  <span className="text-[13px] text-ink-500">
                    Fix the {blocking.length === 1 ? "item" : `${blocking.length} items`} above
                    first.
                  </span>
                )}
              </form>
            )}
            {!isProducer && latest === null && (
              <p className="text-sm text-ink-500">A producer releases the day.</p>
            )}
            {latest && (
              <div className="flex flex-col gap-1">
                <a
                  href={`/api/log/dad-export/${date}?version=${latest.version}`}
                  className="text-sm font-bold text-brand-link hover:underline"
                >
                  Download v{latest.version}
                </a>
                <span className="text-[13px] text-ink-500">
                  {latest.file_name} · put it in DAD&apos;s import folder
                </span>
              </div>
            )}
          </section>

          {day.releases.length > 0 && (
            <section className="flex flex-col gap-2 rounded border border-line p-4">
              <h2 className="text-sm font-bold text-ink-900">History</h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {day.releases.map((release) => (
                  <li key={release.id} className="flex flex-wrap justify-between gap-x-3">
                    <a
                      href={`/api/log/dad-export/${date}?version=${release.version}`}
                      className="font-semibold text-brand-link hover:underline"
                    >
                      v{release.version} · {release.event_count}{" "}
                      {release.event_count === 1 ? "item" : "items"}
                    </a>
                    <span className="text-ink-500">
                      {formatStationTimestamp(release.released_at)}
                      {releaserNames.get(release.released_by)
                        ? ` · ${releaserNames.get(release.released_by)}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase.from("profiles").select("id, display_name").in("id", unique),
      "who released the DAD log",
    ) ?? [];
  return new Map(rows.map((row) => [row.id, row.display_name]));
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: DadIssue[];
  tone: "danger" | "note";
}) {
  return (
    <section
      className={cn(
        "rounded border p-4",
        tone === "danger" ? "border-danger/30 bg-danger/[0.04]" : "border-line bg-panel-50",
      )}
    >
      <h2
        className={cn("mb-2 text-sm font-bold", tone === "danger" ? "text-danger" : "text-ink-900")}
      >
        {title}
      </h2>
      <ul className="flex flex-col gap-2 text-sm text-ink-700">
        {issues.map((issue, index) => (
          <li
            key={`${issue.code}-${issue.itemId ?? issue.breakId ?? index}`}
            className="flex flex-wrap justify-between gap-x-4"
          >
            <span>{issue.message}</span>
            {issue.href && (
              <Link href={issue.href} className="shrink-0 font-bold text-brand-link">
                Fix →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The day's 24 hours with its automated stretches shaded. */
function DayStrip({
  date,
  segments,
}: {
  date: string;
  segments: { startsAt: string; endsAt: string }[];
}) {
  const at = (iso: string) => {
    const parts = stationLocalParts(iso);
    return parts.dateISO === date ? parts.seconds / 864 : 100;
  };
  return (
    <div aria-hidden="true">
      <div className="relative h-6 overflow-hidden rounded border border-line bg-white">
        {segments.map((segment) => (
          <span
            key={segment.startsAt}
            className="absolute inset-y-0 border-x border-[#8A9099] bg-[#DCE1E6]"
            style={{
              left: `${at(segment.startsAt)}%`,
              width: `${at(segment.endsAt) - at(segment.startsAt)}%`,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-500">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>
    </div>
  );
}
