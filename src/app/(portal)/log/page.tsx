import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listPrograms, listScheduleEntries } from "@/lib/log/queries";
import { computeEndTime, formatAirTime, isScheduleEntryActiveOn } from "@/lib/log/schedule";
import { formatStationDateLong, stationTodayISO } from "@/lib/log/timezone";

export default async function LogTodayPage() {
  const [programs, scheduleEntries] = await Promise.all([listPrograms(), listScheduleEntries()]);
  const today = stationTodayISO();
  const activeToday = scheduleEntries
    .filter((entry) => isScheduleEntryActiveOn(entry, today))
    .sort((a, b) => a.air_time.localeCompare(b.air_time));

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
              {activeToday.map((entry) => (
                <Row key={entry.id}>
                  <Cell className="whitespace-nowrap text-ink-700">
                    {formatAirTime(entry.air_time)} – {computeEndTime(entry.air_time, entry.duration_minutes)}
                  </Cell>
                  <Cell className="font-semibold text-ink-900">{entry.programName}</Cell>
                  <Cell>{entry.clockTemplateName}</Cell>
                  <Cell>
                    <Badge variant="muted">Not yet available</Badge>
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
