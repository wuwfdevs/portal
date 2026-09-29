import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listPrograms, listRundownsForDate, listScheduleEntries } from "@/lib/log/queries";
import { computeEndTime, formatAirTime, isScheduleEntryActiveOn } from "@/lib/log/schedule";
import { formatStationDateLong, shiftDateISO, stationTodayISO } from "@/lib/log/timezone";
import { generateRundown } from "./rundown-actions";
import type { LogRundownStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<LogRundownStatus, BadgeVariant> = {
  draft: "neutral",
  generated: "accent",
  in_progress: "warning",
  submitted: "success",
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const COUNT_PARAM = /^\d{1,4}$/;

const NAV_LINK_CLASSES =
  "inline-flex shrink-0 items-center rounded border border-line px-2.5 py-1.5 text-xs font-bold text-ink-700 hover:bg-panel-100";

export default async function LogTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; imported?: string; unresolved?: string }>;
}) {
  const { date: dateParam, error, imported, unresolved } = await searchParams;
  const today = stationTodayISO();
  const selectedDate = dateParam && DATE_ONLY.test(dateParam) ? dateParam : today;
  const [programs, scheduleEntries] = await Promise.all([listPrograms(), listScheduleEntries()]);
  const activeOnDate = scheduleEntries
    .filter((entry) => isScheduleEntryActiveOn(entry, selectedDate))
    .sort((a, b) => a.air_time.localeCompare(b.air_time));
  const rundownByProgram = new Map(
    (await listRundownsForDate(selectedDate)).map((rundown) => [rundown.program_id, rundown]),
  );

  if (programs.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No programs yet. Set up a{" "}
        <Link href="/log/clocks" className="font-semibold text-brand-link">
          clock
        </Link>{" "}
        and{" "}
        <Link href="/log/programs" className="font-semibold text-brand-link">
          schedule a program
        </Link>{" "}
        to see today&apos;s lineup here.
      </div>
    );
  }

  const missingRundowns = activeOnDate.filter((entry) => !rundownByProgram.has(entry.program_id));
  const importHref = `/log/import?date=${selectedDate}`;
  // Set by the program-log import when it lands back here (import-client.tsx).
  const importedCount = imported && COUNT_PARAM.test(imported) ? Number(imported) : null;
  const unresolvedCount = unresolved && COUNT_PARAM.test(unresolved) ? Number(unresolved) : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-ink-900">{formatStationDateLong(selectedDate)}</h2>
          {selectedDate === today && <Badge variant="accent">Today</Badge>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Link href={`/log?date=${shiftDateISO(selectedDate, -1)}`} className={NAV_LINK_CLASSES}>
            ← Prev day
          </Link>
          {selectedDate !== today && (
            <Link href="/log" className={NAV_LINK_CLASSES}>
              Today
            </Link>
          )}
          <Link href={`/log?date=${shiftDateISO(selectedDate, 1)}`} className={NAV_LINK_CLASSES}>
            Next day →
          </Link>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="log-today-date">Jump to date</Label>
              <Input
                id="log-today-date"
                type="date"
                name="date"
                defaultValue={selectedDate}
                className="w-40"
              />
            </div>
            <Button type="submit" variant="secondary" className="shrink-0">
              Go
            </Button>
          </form>
          <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-line sm:block" />
          <Link
            href={importHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-brand-primary px-3 py-2 text-xs font-bold text-brand-link hover:bg-brand-surface/40"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import program log
          </Link>
        </div>
      </div>
      {error && <Alert className="mb-4">{error}</Alert>}
      {importedCount !== null && (
        <Alert variant="success" className="mb-4">
          <strong>
            Imported {importedCount} {importedCount === 1 ? "rundown" : "rundowns"} for{" "}
            {formatStationDateLong(selectedDate)}.
          </strong>
          {unresolvedCount > 0 &&
            ` ${unresolvedCount} ${unresolvedCount === 1 ? "row" : "rows"} in the log could not be placed and ${unresolvedCount === 1 ? "was" : "were"} not imported.`}{" "}
          Open a rundown to review it.
        </Alert>
      )}
      {missingRundowns.length > 0 && (
        <Alert
          variant="note"
          className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1"
        >
          <span>
            <strong className="text-ink-900">
              {missingRundowns.length}{" "}
              {missingRundowns.length === 1 ? "program has" : "programs have"} no rundown for{" "}
              {selectedDate === today ? "today" : "this day"}.
            </strong>{" "}
            Generate each one from its clock, or import the traffic system&apos;s log to build them
            all at once.
          </span>
          <Link href={importHref} className="shrink-0 font-bold text-brand-link">
            Import the log →
          </Link>
        </Alert>
      )}
      {activeOnDate.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No program is scheduled for {selectedDate === today ? "today" : "this date"}.
        </div>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>Time</Th>
                <Th>Program</Th>
                <Th>Clock</Th>
                <Th>Rundown</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {activeOnDate.map((entry) => {
                const rundown = rundownByProgram.get(entry.program_id);
                return (
                  <Row key={entry.id}>
                    <Cell className="whitespace-nowrap text-ink-700">
                      {formatAirTime(entry.air_time)} –{" "}
                      {computeEndTime(entry.air_time, entry.duration_minutes)}
                    </Cell>
                    <Cell className="font-semibold text-ink-900">{entry.programName}</Cell>
                    <Cell>{entry.clockTemplateName}</Cell>
                    <Cell>
                      {rundown ? (
                        <Link href={`/log/rundowns/${rundown.id}`}>
                          <Badge variant={STATUS_VARIANT[rundown.status]}>
                            {rundown.status.replace("_", " ")}
                          </Badge>
                        </Link>
                      ) : (
                        <form action={generateRundown}>
                          <input type="hidden" name="schedule_entry_id" value={entry.id} />
                          <input type="hidden" name="air_date" value={selectedDate} />
                          <Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs">
                            Generate
                          </Button>
                        </form>
                      )}
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
