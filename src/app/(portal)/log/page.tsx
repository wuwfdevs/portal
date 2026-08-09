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

const NAV_LINK_CLASSES =
  "inline-flex shrink-0 items-center rounded border border-line px-2.5 py-1.5 text-xs font-bold text-ink-700 hover:bg-panel-100";

export default async function LogTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const { date: dateParam, error } = await searchParams;
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
        </div>
      </div>
      {error && <Alert className="mb-4">{error}</Alert>}
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
