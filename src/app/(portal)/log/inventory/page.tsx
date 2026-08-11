import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listCurrentClockCapacityInputs, listInventoryReportData, listPrograms } from "@/lib/log/queries";
import { computeClockCapacity, computeInventoryTrend, type ReportGranularity } from "@/lib/log/inventory-report";
import type { BreakStatus } from "@/lib/log/timing";
import { STATION_TIME_ZONE, shiftDateISO, stationTodayISO } from "@/lib/log/timezone";
import { TimeBar, TimeBarLegend } from "./time-bar";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LOOKBACK_DAYS = 56; // 8 weeks

const BREAK_STATUS_LABEL: Record<BreakStatus, string> = {
  filled: "Filled",
  carrying_network: "Carrying network",
  unresolved_required: "Unresolved required",
  over: "Over",
  covered_by_previous: "Covered (required)",
  preempted_by_previous: "Preempted (optional)",
};

const BREAK_STATUS_VARIANT: Record<BreakStatus, BadgeVariant> = {
  filled: "success",
  carrying_network: "neutral",
  unresolved_required: "danger",
  over: "warning",
  covered_by_previous: "success",
  preempted_by_previous: "warning",
};

// Sorted so the actionable/unusual statuses (what a producer would scan
// for) read before the routine ones, when more than one is present.
const BREAK_STATUS_ORDER: BreakStatus[] = [
  "unresolved_required",
  "over",
  "preempted_by_previous",
  "filled",
  "covered_by_previous",
  "carrying_network",
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; start?: string; end?: string; granularity?: string }>;
}) {
  const {
    program: programParam,
    start: startParam,
    end: endParam,
    granularity: granularityParam,
  } = await searchParams;

  const programs = await listPrograms();
  const today = stationTodayISO();
  const selectedEnd = endParam && DATE_ONLY.test(endParam) ? endParam : today;
  const selectedStart =
    startParam && DATE_ONLY.test(startParam) ? startParam : shiftDateISO(selectedEnd, -DEFAULT_LOOKBACK_DAYS);
  const granularity: ReportGranularity = granularityParam === "month" ? "month" : "week";
  const selectedProgramId =
    programParam && programs.some((program) => program.id === programParam) ? programParam : undefined;

  const [capacityInputs, reportData] = await Promise.all([
    listCurrentClockCapacityInputs(),
    listInventoryReportData(selectedStart, selectedEnd, selectedProgramId),
  ]);

  const capacities = capacityInputs
    .map((input) => ({ ...input, capacity: computeClockCapacity(input.slots, input.opportunities) }))
    .sort((a, b) => a.clockTemplateName.localeCompare(b.clockTemplateName));

  const buckets = computeInventoryTrend(reportData.rundowns, reportData.breaks, reportData.items, granularity);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-bold text-ink-900">Local content inventory</h2>
        <p className="mt-1 max-w-2xl text-xs text-ink-400">
          How much airtime is available for local content versus locked to the network, and how much of
          that available time actually gets used — split into what&apos;s configured right now and what
          actually happened in generated rundowns over time.
        </p>
      </div>

      <Card className="p-4">
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Configured today</h3>
        <p className="mb-3 text-xs text-ink-400">
          One clock cycle per currently-scheduled program, not projected across a whole shift — how many
          times a clock repeats within one is rundown generation&apos;s own concern, not this report&apos;s.
          There&apos;s no historical version of this table: local opportunities aren&apos;t versioned, so
          this can only ever describe today&apos;s configuration.
        </p>
        {capacities.length === 0 ? (
          <p className="text-xs text-ink-400">Nothing scheduled today.</p>
        ) : (
          <TableFrame>
            <Table>
              <thead>
                <HeaderRow>
                  <Th>Program</Th>
                  <Th>Clock</Th>
                  <Th>Cycle length</Th>
                  <Th>Local-eligible</Th>
                  <Th>Of which required</Th>
                  <Th>Network</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {capacities.map((row) => (
                  <Row key={row.clockTemplateId}>
                    <Cell>{row.programNames.join(", ")}</Cell>
                    <Cell>
                      <Link href={`/log/clocks/${row.clockTemplateId}`} className="font-semibold text-brand-link">
                        {row.clockTemplateName}
                      </Link>
                    </Cell>
                    <Cell>{formatHoursMinutes(row.capacity.totalSeconds)}</Cell>
                    <Cell>
                      {formatHoursMinutes(row.capacity.localEligibleSeconds)}
                      {row.capacity.totalSeconds > 0 && (
                        <span className="ml-1 text-ink-400">
                          ({Math.round((row.capacity.localEligibleSeconds / row.capacity.totalSeconds) * 100)}%)
                        </span>
                      )}
                    </Cell>
                    <Cell>{formatHoursMinutes(row.capacity.requiredSeconds)}</Cell>
                    <Cell>{formatHoursMinutes(row.capacity.networkSeconds)}</Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">Actual, over time</h3>

        <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
          <div>
            <Label htmlFor="inv-program">Program</Label>
            <Select id="inv-program" name="program" defaultValue={selectedProgramId ?? ""} className="w-56">
              <option value="">All programs</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="inv-start">From</Label>
            <Input id="inv-start" type="date" name="start" defaultValue={selectedStart} className="w-40" />
          </div>
          <div>
            <Label htmlFor="inv-end">To</Label>
            <Input id="inv-end" type="date" name="end" defaultValue={selectedEnd} className="w-40" />
          </div>
          <div>
            <Label htmlFor="inv-granularity">Bucket by</Label>
            <Select id="inv-granularity" name="granularity" defaultValue={granularity} className="w-32">
              <option value="week">Week</option>
              <option value="month">Month</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary" className="shrink-0">
            Update
          </Button>
        </form>

        {buckets.length === 0 ? (
          <p className="text-xs text-ink-400">
            No rundowns were generated for {selectedProgramId ? "this program" : "any program"} between{" "}
            {selectedStart} and {selectedEnd}.
          </p>
        ) : (
          <>
            <TimeBarLegend />
            <div className="mt-4 flex flex-col gap-4">
              {buckets.map((bucket) => {
                const unusedSeconds = Math.max(0, bucket.localAvailableSeconds - bucket.localUsedSeconds);
                const presentStatuses = BREAK_STATUS_ORDER.filter((status) => bucket.breakCounts[status] > 0);

                return (
                  <div key={bucket.key}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs font-bold text-ink-700">
                        {granularity === "month" ? formatMonthLabel(bucket.startDate) : formatWeekLabel(bucket.startDate)}
                      </span>
                      <span className="text-[11px] text-ink-400">
                        {bucket.rundownCount} rundown{bucket.rundownCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <TimeBar
                      networkSeconds={bucket.networkSeconds}
                      usedSeconds={bucket.localUsedSeconds}
                      availableUnusedSeconds={unusedSeconds}
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-400">
                      <span>{formatHoursMinutes(bucket.networkSeconds)} network</span>
                      <span>
                        {formatHoursMinutes(bucket.localUsedSeconds)} used of{" "}
                        {formatHoursMinutes(bucket.localAvailableSeconds)} available
                        {bucket.localAvailableSeconds > 0 && (
                          <> ({Math.round((bucket.localUsedSeconds / bucket.localAvailableSeconds) * 100)}%)</>
                        )}
                      </span>
                      {presentStatuses.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {presentStatuses.map((status) => (
                            <Badge key={status} variant={BREAK_STATUS_VARIANT[status]}>
                              {BREAK_STATUS_LABEL[status]}: {bucket.breakCounts[status]}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** m for under an hour, h[ m] beyond that — this report always deals in minutes-and-up, never seconds. */
function formatHoursMinutes(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatShortDate(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: STATION_TIME_ZONE,
    month: "short",
    day: "numeric",
  });
}

function formatWeekLabel(mondayISO: string): string {
  return `${formatShortDate(mondayISO)} – ${formatShortDate(shiftDateISO(mondayISO, 6))}`;
}

function formatMonthLabel(firstOfMonthISO: string): string {
  return new Date(`${firstOfMonthISO}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: STATION_TIME_ZONE,
    month: "long",
    year: "numeric",
  });
}
