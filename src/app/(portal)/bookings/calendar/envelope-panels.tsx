import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { formatMinutes, type AirtimeEnvelope } from "@/lib/bookings/airtime";
import { PLAN_PATH, withQuery } from "@/lib/bookings/paths";
import {
  formatHours,
  formatMonth,
  totalCapacity,
  type ClassCapacitySummary,
  type MonthCapacity,
} from "@/lib/bookings/scheduling";
import type { BkTermPlanRow } from "@/lib/bookings/queries";

/**
 * The two envelopes (docs/bookings-design.md §8), side by side above the
 * calendar: production capacity per labor class in professional hours
 * (shown in days), and the airtime envelope read from On Air's clocks.
 * Pure display; the figures come from lib/bookings/scheduling.ts and
 * lib/bookings/airtime.ts.
 */

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
      <span className="text-[15px] font-semibold text-ink-900">{value}</span>
      {hint && <span className="text-[11px] text-ink-500">{hint}</span>}
    </div>
  );
}

export function CapacityPanel({
  plan,
  classes,
  months,
  canEdit,
}: {
  plan: BkTermPlanRow;
  classes: ClassCapacitySummary[];
  months: MonthCapacity[];
  canEdit: boolean;
}) {
  const total = totalCapacity(classes);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-bold text-ink-900">Production capacity</h3>
        <span className="text-xs text-ink-500">
          Hours per labor class; a project day is 8. A class&apos;s reserve is the share of its
          hours WUWF contributes to strategic work; a class with none draws open capacity.
        </span>
        <span className="flex-1" />
        {canEdit && (
          <Link
            href={withQuery(PLAN_PATH, { plan: plan.id })}
            className="text-xs font-bold text-brand-link hover:underline"
          >
            Edit the term plan
          </Link>
        )}
      </div>
      {classes.length === 0 ? (
        <Alert variant="note">
          No labor class has capacity on this term plan yet, so bookings are not capacity-checked.
          The director sets each class&apos;s hours, reserve share, headcount and hours a day on the
          term plan.
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure
              label="Hours available"
              value={formatHours(total.net)}
              hint="Across tracked classes"
            />
            <Figure
              label="Reserve left"
              value={formatHours(total.reserveRemaining)}
              hint={`of ${formatHours(total.reserve)} for strategic work`}
            />
            <Figure
              label="Spoken for"
              value={formatHours(total.booked + total.held)}
              hint={`${formatHours(total.booked)} booked · ${formatHours(total.held)} held`}
            />
            <Figure
              label="Open capacity"
              value={formatHours(total.open)}
              hint="Hours available − reserve − held − other bookings"
            />
          </div>
          <TableFrame>
            <Table stack>
              <thead>
                <HeaderRow>
                  <Th>Class</Th>
                  <Th className="text-right">Net</Th>
                  <Th className="text-right">Reserve left</Th>
                  <Th className="text-right">Held</Th>
                  <Th className="text-right">Booked</Th>
                  <Th className="text-right">Open</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {classes.map((row) => (
                  <Row key={row.labor_class_id}>
                    <Cell stack="title">
                      {row.name}
                      <span className="block text-xs text-ink-500">
                        {row.headcount > 1 ? `${row.headcount} people · ` : ""}
                        {row.hoursPerPersonDay} h a day each
                      </span>
                    </Cell>
                    <Cell label="Net" className="text-right">
                      {formatHours(row.net)}
                    </Cell>
                    <Cell label="Reserve left" className="text-right">
                      {row.hasReserve ? (
                        formatHours(row.reserveRemaining)
                      ) : (
                        <span className="text-ink-400">None</span>
                      )}
                    </Cell>
                    <Cell label="Held" className="text-right">
                      {formatHours(row.held)}
                    </Cell>
                    <Cell label="Booked" className="text-right">
                      {formatHours(row.booked)}
                    </Cell>
                    <Cell
                      label="Open"
                      className={`text-right font-semibold ${row.open < 0 ? "text-[#8F3A3A]" : ""}`}
                    >
                      {formatHours(row.open)}
                    </Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        </>
      )}
      {months.length > 0 && classes.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-bold text-brand-link">
            Open capacity by month
          </summary>
          <TableFrame className="mt-2">
            <Table stack>
              <thead>
                <HeaderRow>
                  <Th>Month</Th>
                  <Th className="text-right">Term days</Th>
                  <Th className="text-right">Open share</Th>
                  <Th className="text-right">Booked</Th>
                  <Th className="text-right">Left</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {months.map((month) => (
                  <Row key={month.month}>
                    <Cell stack="title">{formatMonth(month.month)}</Cell>
                    <Cell label="Term days" className="text-right">
                      {month.days}
                    </Cell>
                    <Cell label="Open share" className="text-right">
                      {formatHours(month.openShare)}
                    </Cell>
                    <Cell label="Booked" className="text-right">
                      {formatHours(month.nonStrategicBooked)}
                    </Cell>
                    <Cell
                      label="Left"
                      className={`text-right ${month.openRemaining < 0 ? "text-[#8F3A3A]" : ""}`}
                    >
                      {formatHours(month.openRemaining)}
                    </Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
          <p className="mt-1 text-xs text-ink-500">
            Open capacity is spread across the term by days. A booking that would take more than
            half of a month&apos;s remaining open hours warns, so one month is not sold out early.
          </p>
        </details>
      )}
    </Card>
  );
}

export function AirtimePanel({
  envelope,
  error,
  asOf,
}: {
  envelope: AirtimeEnvelope;
  error: string | null;
  asOf: string | null;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-bold text-ink-900">Airtime envelope</h3>
        <span className="text-xs text-ink-500">
          Read from On Air&apos;s clocks{asOf ? ` as scheduled on ${asOf}` : ""}; placed in Traffic
          or On Air, never here.
        </span>
      </div>
      {error ? (
        <Alert>Could not read the clocks: {error}</Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure
              label="Eligible avails"
              value={`${envelope.availsPerWeek} a week`}
              hint={`${formatMinutes(envelope.eligibleMinutesPerWeek)} that admit university messaging`}
            />
            <Figure
              label="Station pins"
              value={formatMinutes(envelope.pinnedMinutesPerWeek)}
              hint="Content On Air already pins there"
            />
            <Figure
              label="Contributed"
              value={formatMinutes(envelope.contributedMinutesPerWeek)}
              hint={
                envelope.contributedShare !== null
                  ? `${Math.round(envelope.contributedShare * 1000) / 10}% of eligible minutes`
                  : "The executive's minutes a week"
              }
            />
            <Figure
              label="Traffic's to sell"
              value={formatMinutes(envelope.sellableMinutesPerWeek)}
              hint="Eligible − pins − contributed"
            />
          </div>
          {envelope.programs.length === 0 ? (
            <Alert variant="note">
              No clock marks an opportunity for a university announcement yet. The program director
              marks eligibility on a clock&apos;s page in On Air.
            </Alert>
          ) : (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-bold text-brand-link">
                By program
              </summary>
              <TableFrame className="mt-2">
                <Table stack>
                  <thead>
                    <HeaderRow>
                      <Th>Program</Th>
                      <Th className="text-right">Avails a week</Th>
                      <Th className="text-right">Minutes a week</Th>
                      <Th className="text-right">Pinned</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {envelope.programs.map((program) => (
                      <Row key={program.program_id}>
                        <Cell stack="title">{program.name}</Cell>
                        <Cell label="Avails a week" className="text-right">
                          {program.avails_per_week}
                        </Cell>
                        <Cell label="Minutes a week" className="text-right">
                          {formatMinutes(program.minutes_per_week)}
                        </Cell>
                        <Cell label="Pinned" className="text-right">
                          {formatMinutes(program.pinned_minutes_per_week)}
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
            </details>
          )}
          {envelope.sellableMinutesPerWeek < 0 && (
            <Alert variant="warning">
              The contributed envelope is larger than the eligible avail time left after the
              station&apos;s pins. Either mark more opportunities in On Air or lower the envelope.
            </Alert>
          )}
        </>
      )}
    </Card>
  );
}
