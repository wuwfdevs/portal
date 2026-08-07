import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listPrograms, listRundownsForDate, listScheduleEntries } from "@/lib/log/queries";
import { computeEndTime, formatAirTime, isScheduleEntryActiveOn } from "@/lib/log/schedule";
import { formatStationDateLong, stationTodayISO } from "@/lib/log/timezone";
import { generateRundown } from "./rundown-actions";
import type { LogRundownStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<LogRundownStatus, BadgeVariant> = {
  draft: "neutral",
  generated: "accent",
  in_progress: "warning",
  submitted: "success",
};

export default async function LogTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [programs, scheduleEntries] = await Promise.all([listPrograms(), listScheduleEntries()]);
  const today = stationTodayISO();
  const activeToday = scheduleEntries
    .filter((entry) => isScheduleEntryActiveOn(entry, today))
    .sort((a, b) => a.air_time.localeCompare(b.air_time));
  const rundownByProgram = new Map(
    (await listRundownsForDate(today)).map((rundown) => [rundown.program_id, rundown]),
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
      <h2 className="mb-3 text-sm font-bold text-ink-900">{formatStationDateLong(today)}</h2>
      {error && <Alert className="mb-4">{error}</Alert>}
      {activeToday.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No program is scheduled for today.
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
              {activeToday.map((entry) => {
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
                          <input type="hidden" name="air_date" value={today} />
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
