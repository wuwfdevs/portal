import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import {
  airtimeEnvelope,
  envelopeCheck,
  formatMinutes,
  parseAirtimeRead,
} from "@/lib/bookings/airtime";
import { calendarStateFrom } from "@/lib/bookings/estimate";
import { BOOKING_STATUS_LABEL, TREATMENT_SHORT_LABEL } from "@/lib/bookings/labels";
import {
  CALENDAR_PATH,
  PLAN_PATH,
  REQUESTS_PATH,
  requestHref,
  withQuery,
} from "@/lib/bookings/paths";
import { STAGE_LABEL, actionItems } from "@/lib/bookings/projects";
import {
  getActivePlan,
  getPlanCalendar,
  listAirtimeCommitments,
  listOpenProjects,
  readUniversityAvails,
} from "@/lib/bookings/queries";
import {
  bookingIsLive,
  capacitySummary,
  formatHours,
  formatWindow,
  totalCapacity,
} from "@/lib/bookings/scheduling";
import { formatDateShort } from "@/lib/log/program-status";
import { stationTodayISO } from "@/lib/log/timezone";
import { weekDates } from "@/lib/log/week-layout";

/**
 * The Dashboard (docs/bookings-design.md §4): the term's capacity bar, the
 * airtime envelope in one line, "Needs your action" filtered by the
 * viewer's roles, this week's dates, and term-to-date tiles. The term report
 * arrives in slice 6.
 */
export default async function BookingsDashboard() {
  const context = await requireBookingsAccess();
  const today = stationTodayISO();
  const nowISO = new Date().toISOString();
  const [plan, projects, commitments] = await Promise.all([
    getActivePlan(),
    listOpenProjects(),
    listAirtimeCommitments(),
  ]);
  const [calendar, avails] = plan
    ? await Promise.all([getPlanCalendar(plan), readUniversityAvails(plan.id)])
    : [null, null];
  const state = calendar ? calendarStateFrom(calendar, nowISO) : null;
  const total = state ? totalCapacity(capacitySummary(state)) : null;
  const envelope = plan
    ? airtimeEnvelope(
        parseAirtimeRead(avails?.payload ?? null),
        plan.airtime_contributed_minutes_per_week,
      )
    : null;
  const airtime = plan
    ? envelopeCheck(
        commitments.filter((c) => c.project_disposition === null),
        plan,
        plan.airtime_contributed_minutes_per_week,
      )
    : null;

  const items = actionItems(projects, context.roles, nowISO, today);
  const week = weekDates(today);
  const weekStart = week[0]!;
  const weekEnd = week[6]!;
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));
  // The pure state drops project_id; read it back off the rows for the link.
  const projectOf = new Map((calendar?.bookings ?? []).map((b) => [b.id, b.project_id]));
  const thisWeek = (state?.bookings ?? [])
    .filter((b) => b.date >= weekStart && b.date <= weekEnd && bookingIsLive(b, nowISO))
    .map((b) => ({ ...b, project_id: projectOf.get(b.id) ?? null }))
    .sort((a, b) => (a.date + a.window_start).localeCompare(b.date + b.window_start));
  const poolName = (id: string) => state?.pools.find((p) => p.id === id)?.name ?? "Pool";
  const countAt = (stage: string) => projects.filter((p) => p.stage === stage).length;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-serif text-[17px] font-bold text-ink-900">Dashboard</h2>

      {!plan ? (
        <Alert variant="note">
          No term plan is active, so there is no capacity to show.{" "}
          {context.isDirector ? (
            <Link
              href={withQuery(PLAN_PATH, { new: "1" })}
              className="font-bold text-brand-link hover:underline"
            >
              Create the term plan.
            </Link>
          ) : (
            "The Director of Operations creates it on the Calendar tab."
          )}
        </Alert>
      ) : (
        <section className="flex flex-col gap-3 rounded border border-line bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-bold text-ink-900">{plan.label}</h3>
            <span className="text-xs text-ink-500">
              {formatDateShort(plan.starts_on)} – {formatDateShort(plan.ends_on)} · professional
              hours across tracked classes; a project day is 8
            </span>
            <span className="flex-1" />
            <Link
              href={CALENDAR_PATH}
              className="text-xs font-bold text-brand-link hover:underline"
            >
              Calendar
            </Link>
          </div>
          {total && total.net > 0 ? (
            <CapacityBar
              segments={[
                { label: "Strategic", hours: total.strategicBooked, className: "bg-[#2E6DA4]" },
                {
                  label: "Reserve to preserve",
                  hours: Math.max(0, total.reserveRemaining),
                  className: "bg-[#9FC3E3]",
                },
                {
                  label: "Incremental and external",
                  hours: total.nonStrategicBooked,
                  className: "bg-[#0F2235]",
                },
                { label: "Held for WUWF", hours: total.held, className: "bg-[#8A9099]" },
                { label: "Open", hours: Math.max(0, total.open), className: "bg-panel-100" },
              ]}
              net={total.net}
            />
          ) : (
            <Alert variant="note">
              No labor class has capacity on this term plan yet; the director sets each class&apos;s
              net hours on the term plan.
            </Alert>
          )}
          {envelope && airtime && (
            <p className="text-sm text-ink-700">
              <span className="font-semibold text-ink-900">Airtime envelope:</span>{" "}
              {formatMinutes(airtime.contributedMinutesPerWeek)} a week contributed,{" "}
              {formatMinutes(airtime.committedMinutesPerWeek)} committed to requests,{" "}
              <span className={airtime.exceeded ? "font-semibold text-[#8F3A3A]" : ""}>
                {formatMinutes(airtime.remainingMinutesPerWeek)} left
              </span>
              {avails?.error
                ? ` · the clocks could not be read (${avails.error})`
                : ` · ${formatMinutes(envelope.eligibleMinutesPerWeek)} of eligible avails a week on the clocks, ${formatMinutes(envelope.sellableMinutesPerWeek)} for Traffic to sell`}
              .
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Requests"
          value={countAt("request")}
          hint="awaiting an estimate"
          href={withQuery(REQUESTS_PATH, { view: "request" })}
        />
        <Tile
          label="Estimates out"
          value={countAt("estimate")}
          hint="holding dates tentatively"
          href={withQuery(REQUESTS_PATH, { view: "estimate" })}
        />
        <Tile
          label="Booked"
          value={countAt("booked")}
          hint="dates confirmed"
          href={withQuery(REQUESTS_PATH, { view: "booked" })}
        />
        <Tile
          label="Delivered"
          value={countAt("delivered")}
          hint="awaiting settlement"
          href={withQuery(REQUESTS_PATH, { view: "delivered" })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="flex flex-col gap-3 rounded border border-line bg-white p-4">
          <h3 className="text-sm font-bold text-ink-900">
            Needs your action
            <span className="ml-2 text-xs font-normal text-ink-500">
              {context.roles.length === 0 ? "everything open" : `for ${context.roles.join(", ")}`}
            </span>
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing is waiting on you.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {items.map((item) => (
                <li
                  key={`${item.projectId}-${item.kind}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm"
                >
                  <Link
                    href={requestHref(item.projectId)}
                    className="font-semibold text-brand-link hover:underline"
                  >
                    {item.title}
                  </Link>
                  <span className="text-ink-700">{item.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded border border-line bg-white p-4">
          <h3 className="text-sm font-bold text-ink-900">
            This week
            <span className="ml-2 text-xs font-normal text-ink-500">
              {formatDateShort(weekStart)} – {formatDateShort(weekEnd)}
            </span>
          </h3>
          {thisWeek.length === 0 ? (
            <p className="text-sm text-ink-500">No partner dates this week.</p>
          ) : (
            <TableFrame>
              <Table stack>
                <thead>
                  <HeaderRow>
                    <Th>When</Th>
                    <Th>What</Th>
                    <Th>Pool</Th>
                    <Th>Status</Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {thisWeek.map((booking) => (
                    <Row key={booking.id}>
                      <Cell stack="title">
                        {formatDateShort(booking.date, true)} ·{" "}
                        {formatWindow(booking.window_start, booking.window_end)}
                      </Cell>
                      <Cell label="What">
                        {booking.project_id && projectTitle.has(booking.project_id) ? (
                          <Link
                            href={requestHref(booking.project_id)}
                            className="font-semibold text-brand-link hover:underline"
                          >
                            {projectTitle.get(booking.project_id)}
                          </Link>
                        ) : (
                          booking.label
                        )}
                        <span className="block text-xs text-ink-500">
                          {TREATMENT_SHORT_LABEL[booking.treatment]}
                        </span>
                      </Cell>
                      <Cell label="Pool">{poolName(booking.pool_id)}</Cell>
                      <Cell label="Status">
                        <Badge variant={booking.status === "confirmed" ? "success" : "neutral"}>
                          {BOOKING_STATUS_LABEL[booking.status]}
                        </Badge>
                      </Cell>
                    </Row>
                  ))}
                </tbody>
              </Table>
            </TableFrame>
          )}
        </section>
      </div>

      <p className="text-xs text-ink-500">
        Stages: {Object.values(STAGE_LABEL).join(" → ")}. The term report arrives with hours and
        settlement.
      </p>
    </div>
  );
}

function CapacityBar({
  segments,
  net,
}: {
  segments: { label: string; hours: number; className: string }[];
  net: number;
}) {
  const shown = segments.filter((s) => s.hours > 0);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-4 w-full overflow-hidden rounded border border-line"
        role="img"
        aria-label={segments.map((s) => `${s.label} ${formatHours(s.hours)}`).join("; ")}
      >
        {shown.map((s) => (
          <span
            key={s.label}
            className={s.className}
            style={{ width: `${Math.min(100, (s.hours / net) * 100)}%` }}
            title={`${s.label}: ${formatHours(s.hours)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-700">
        {segments.map((s) => (
          <span key={s.label}>
            <span
              aria-hidden="true"
              className={`mr-1.5 inline-block size-3 rounded-[2px] border border-line align-[-1px] ${s.className}`}
            />
            {s.label} · {formatHours(s.hours)}
          </span>
        ))}
        <span className="text-ink-500">of {formatHours(net)} net</span>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-0.5 rounded border border-line bg-white p-4 hover:border-brand-primary"
    >
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
      <span className="text-2xl font-semibold text-ink-900">{value}</span>
      <span className="text-[11px] text-ink-500">{hint}</span>
    </Link>
  );
}
