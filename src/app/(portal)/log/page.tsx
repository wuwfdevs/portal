import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ControlRow } from "@/components/ui/control-row";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { pluralize } from "@/lib/format";
import { isValidDateISO } from "@/lib/dates";
import { listPrograms, listRundownsForDate, listScheduleEntries } from "@/lib/log/queries";
import { computeEndTime, entriesInForceOn, formatAirTime } from "@/lib/log/schedule";
import { RUNDOWN_STATUS } from "@/lib/log/status-badges";
import { formatStationDateLong, shiftDateISO, stationTodayISO } from "@/lib/log/timezone";
import { generateRundown } from "./rundown-actions";

const COUNT_PARAM = /^\d{1,4}$/;

/** Tray with an arrow into it (import) or out of it (export). */
function TransferIcon({ direction, size = 14 }: { direction: "in" | "out"; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      {direction === "in" ? (
        <>
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </>
      ) : (
        <>
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </>
      )}
    </svg>
  );
}

export default async function LogTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; imported?: string; unresolved?: string }>;
}) {
  const { date: dateParam, error, imported, unresolved } = await searchParams;
  const today = stationTodayISO();
  const selectedDate = isValidDateISO(dateParam) ? dateParam : today;
  const [programs, scheduleEntries] = await Promise.all([listPrograms(), listScheduleEntries()]);
  // One row per program: a one-time change replaces the recurring entry for its dates.
  const activeOnDate = entriesInForceOn(scheduleEntries, selectedDate).sort((a, b) =>
    a.air_time.localeCompare(b.air_time),
  );
  const rundownByProgram = new Map(
    (await listRundownsForDate(selectedDate)).map((rundown) => [rundown.program_id, rundown]),
  );

  if (programs.length === 0) {
    return (
      <EmptyState>
        No programs yet. Add and{" "}
        <Link href="/log/programs" className="font-semibold text-brand-link">
          schedule a program
        </Link>{" "}
        to see today&apos;s lineup here.
      </EmptyState>
    );
  }

  const missingRundowns = activeOnDate.filter((entry) => !rundownByProgram.has(entry.program_id));
  const importHref = `/log/import?date=${selectedDate}`;
  // Set by the program-log import when it lands back here (import-client.tsx).
  const importedCount = imported && COUNT_PARAM.test(imported) ? Number(imported) : null;
  const unresolvedCount = unresolved && COUNT_PARAM.test(unresolved) ? Number(unresolved) : 0;

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-ink-900">{formatStationDateLong(selectedDate)}</h2>
          {selectedDate === today && <Badge variant="accent">Today</Badge>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          {/* Day navigation: the arrows are squares either side of the date on a phone. */}
          <ControlRow className="sm:flex-nowrap">
            <SecondaryLink
              size="sm"
              href={`/log?date=${shiftDateISO(selectedDate, -1)}`}
              phoneIcon={<ChevronLeftIcon className="size-4" />}
            >
              ← Prev day
            </SecondaryLink>
            <form id="log-date-form" method="get" className="max-sm:flex-1" data-row="grow">
              <Input
                id="log-today-date"
                type="date"
                name="date"
                aria-label="Jump to date"
                defaultValue={selectedDate}
                className="w-40 max-sm:w-full max-sm:min-w-0"
              />
            </form>
            <SecondaryLink
              size="sm"
              href={`/log?date=${shiftDateISO(selectedDate, 1)}`}
              phoneIcon={<ChevronRightIcon className="size-4" />}
            >
              Next day →
            </SecondaryLink>
            <Button
              type="submit"
              form="log-date-form"
              variant="secondary"
              data-row="fixed"
              className="shrink-0"
            >
              Go
            </Button>
          </ControlRow>
          <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-line sm:block" />
          <ControlRow>
            {selectedDate !== today && (
              <SecondaryLink size="sm" href="/log" data-row="fixed">
                Today
              </SecondaryLink>
            )}
            <SecondaryLink
              href={importHref}
              size="sm"
              className="shrink-0"
              title="Import the traffic system's program log"
            >
              <TransferIcon direction="in" />
              Import
            </SecondaryLink>
            <SecondaryLink
              href={`/log/dad-log?date=${selectedDate}`}
              size="sm"
              className="shrink-0"
              title="Export the DAD log for automated hours"
            >
              <TransferIcon direction="out" />
              Export
            </SecondaryLink>
          </ControlRow>
        </div>
      </div>
      {error && <Alert className="mb-4">{error}</Alert>}
      {importedCount !== null && (
        <Alert variant="success" className="mb-4">
          <strong>
            Imported {pluralize(importedCount, "rundown")} for {formatStationDateLong(selectedDate)}
            .
          </strong>
          {unresolvedCount > 0 &&
            ` ${unresolvedCount} ${unresolvedCount === 1 ? "row" : "rows"} in the log could not be placed and ${unresolvedCount === 1 ? "was" : "were"} not imported.`}{" "}
          Open a rundown to review it.
        </Alert>
      )}
      {missingRundowns.length > 0 && (
        <Alert
          variant="note"
          className="mb-4"
          action={
            <TextLink href={importHref} className="shrink-0 text-xs">
              Import the log →
            </TextLink>
          }
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
        </Alert>
      )}
      {activeOnDate.length === 0 ? (
        <EmptyState>
          No program is scheduled for {selectedDate === today ? "today" : "this date"}.
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack>
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
                    <Cell label="Time" className="whitespace-nowrap text-ink-700">
                      {formatAirTime(entry.air_time)} –{" "}
                      {computeEndTime(entry.air_time, entry.duration_minutes)}
                    </Cell>
                    <Cell stack="title" className="font-semibold text-ink-900">
                      {entry.programName}
                    </Cell>
                    <Cell label="Clock">
                      {entry.clockTemplateName}
                      {entry.entry_type === "override" && (
                        <Badge variant="accent" className="ml-2">
                          One-time change
                        </Badge>
                      )}
                    </Cell>
                    <Cell stack="aside">
                      {rundown ? (
                        <Link href={`/log/rundowns/${rundown.id}`}>
                          <StatusBadge map={RUNDOWN_STATUS} value={rundown.status} />
                        </Link>
                      ) : (
                        <form action={generateRundown}>
                          <input type="hidden" name="schedule_entry_id" value={entry.id} />
                          <input type="hidden" name="air_date" value={selectedDate} />
                          <Button type="submit" variant="secondary" size="sm">
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
