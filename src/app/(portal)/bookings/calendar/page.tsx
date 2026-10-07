import Link from "next/link";
import { ActionMenu } from "@/components/ui/action-menu";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { calendarStateFrom } from "@/lib/bookings/estimate";
import { airtimeEnvelope, parseAirtimeRead } from "@/lib/bookings/airtime";
import {
  BOOKING_STATUS_LABEL,
  HOLD_KIND_LABEL,
  TERM_PLAN_STATUS_LABEL,
  TREATMENT_LABEL,
  PRODUCTION_RATE_LABEL,
} from "@/lib/bookings/labels";
import { PLAN_PATH, calendarHref, withQuery } from "@/lib/bookings/paths";
import {
  getPlanCalendar,
  listPlans,
  pickPlan,
  readUniversityAvails,
  type BkLaborClassRow,
} from "@/lib/bookings/queries";
import {
  bookingIsLive,
  capacitySummary,
  checkBooking,
  formatClock,
  formatHours,
  formatWindow,
  monthlyCapacity,
  parseWindows,
  totalCapacity,
  totalHours,
  windowsFor,
  type BookingRequest,
  type CalendarState,
  type HoursByClass,
} from "@/lib/bookings/scheduling";
import type { BkPricingTreatment } from "@/lib/database.types";
import { formatDateShort } from "@/lib/log/program-status";
import { stationTodayISO } from "@/lib/log/timezone";
import { isValidDateISO, weekDates } from "@/lib/log/week-layout";
import {
  confirmBooking,
  createBlackout,
  createBooking,
  createHold,
  deleteBlackout,
  deleteHold,
  releaseBooking,
} from "./actions";
import { CalendarGrid, type CalendarView } from "./calendar-grid";
import { AirtimePanel, CapacityPanel } from "./envelope-panels";

type Params = {
  plan?: string;
  view?: string;
  date?: string;
  pool?: string;
  new?: string;
  error?: string;
  check?: string;
  envelopes?: string;
  c_pool?: string;
  c_date?: string;
  c_window?: string;
  c_treatment?: string;
  [key: `c_hours_${string}`]: string | undefined;
};

const TREATMENTS: readonly BkPricingTreatment[] = ["strategic", "incremental", "external"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function describeHours(hours: HoursByClass, classes: BkLaborClassRow[]): string {
  const parts = Object.entries(hours)
    .filter(([, value]) => Number(value) > 0)
    .map(
      ([classId, value]) => `${classes.find((c) => c.id === classId)?.name ?? "Labor"} ${value} h`,
    );
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * The Calendar tab (docs/bookings-design.md §4): the term's two envelopes,
 * then the week or month picture of every resource and tracked labor class,
 * with the director's blackouts and holds and production's bookings. View,
 * date, pool and the open create card are query-string state; every write
 * is a form.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const today = stationTodayISO();
  const plans = await listPlans();
  const plan = pickPlan(plans, params.plan);
  const canDirect = context.isDirector;
  const canSchedule = context.isProduction || context.isDirector || context.isExecutive;

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-[17px] font-bold text-ink-900">Calendar</h2>
        <div className="rounded border border-dashed border-line bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink-900">No term plan yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
            The calendar starts from a term plan: the term&apos;s dates, each labor class&apos;s
            hours, the reserve, the airtime the station contributes, and each pool&apos;s units and
            windows.
          </p>
          {canDirect ? (
            <PrimaryLink href={withQuery(PLAN_PATH, { new: "1" })} className="mt-4">
              + Term plan
            </PrimaryLink>
          ) : (
            <p className="mt-3 text-xs text-ink-500">The Director of Operations creates it.</p>
          )}
        </div>
      </div>
    );
  }

  const view: CalendarView = params.view === "month" ? "month" : "week";
  const date = isValidDateISO(params.date)
    ? params.date
    : today >= plan.starts_on && today <= plan.ends_on
      ? today
      : plan.starts_on;

  const nowISO = new Date().toISOString();
  const [calendar, avails] = await Promise.all([
    getPlanCalendar(plan),
    readUniversityAvails(plan.id),
  ]);
  const state = calendarStateFrom(calendar, nowISO);
  const classSummaries = capacitySummary(state);
  const months = monthlyCapacity(state);
  const read = parseAirtimeRead(avails.payload);
  const envelope = airtimeEnvelope(read, plan.airtime_contributed_minutes_per_week);

  const resourcedPools = calendar.pools.filter((pool) =>
    state.resources.some((r) => r.pool_id === pool.id),
  );
  const poolFilter = resourcedPools.some((pool) => pool.id === params.pool)
    ? (params.pool as string)
    : null;
  const poolIds = resourcedPools
    .filter((pool) => poolFilter === null || pool.id === poolFilter)
    .map((pool) => pool.id);
  const poolName = (id: string | null) => calendar.pools.find((p) => p.id === id)?.name ?? "Pool";
  const classesForHours = calendar.classes.filter((cls) => cls.active);

  const here = (extra?: Record<string, string | undefined>) =>
    calendarHref({ plan: plan.id, view, date, pool: poolFilter ?? undefined, ...extra });
  const weekHref = (d: string) =>
    calendarHref({ plan: plan.id, view: "week", date: d, pool: poolFilter ?? undefined });
  const monthHref = (d: string) =>
    calendarHref({ plan: plan.id, view: "month", date: d, pool: poolFilter ?? undefined });

  // "Find a slot": a GET form that runs the rule without writing anything.
  const check = params.check === "1" ? runCheck(params, state) : null;

  // The items in view — the week's, or the month's.
  const rangeDates =
    view === "week"
      ? weekDates(date)
      : Array.from(
          {
            length: new Date(
              Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
            ).getUTCDate(),
          },
          (_, i) => `${date.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
        );
  const rangeStart = rangeDates[0]!;
  const rangeEnd = rangeDates[rangeDates.length - 1]!;
  const inRange = (d: string) => d >= rangeStart && d <= rangeEnd;
  const poolMatches = (poolId: string | null) =>
    poolFilter === null || poolId === null || poolId === poolFilter;
  const blackoutsInRange = state.blackouts.filter(
    (b) =>
      b.starts_on <= rangeEnd &&
      b.ends_on >= rangeStart &&
      (b.pool_ids === null || b.pool_ids.some((id) => poolMatches(id))),
  );
  const holdsInRange = state.holds.filter((h) => inRange(h.date) && poolMatches(h.pool_id));
  const bookingsInRange = state.bookings.filter(
    (b) => inRange(b.date) && poolMatches(b.pool_id) && bookingIsLive(b, nowISO),
  );
  const allWindows = poolIds.flatMap((poolId) =>
    windowsFor(
      state.resources.find((r) => r.pool_id === poolId),
      parseWindows(calendar.pools.find((p) => p.id === poolId)?.default_windows),
    ),
  );
  const uniqueWindows = allWindows.filter(
    (w, index) => allWindows.findIndex((o) => o.start === w.start && o.end === w.end) === index,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-[17px] font-bold text-ink-900">Calendar</h2>
        {plans.length > 1 && (
          <FilterChips
            label="Term"
            chips={plans.map((candidate) => ({
              label: candidate.label,
              href: calendarHref({ plan: candidate.id, view }),
              active: candidate.id === plan.id,
            }))}
          />
        )}
        <span className="flex-1" />
        <Link
          href={withQuery(PLAN_PATH, { plan: plan.id })}
          className="px-1 text-sm font-bold text-brand-link hover:underline"
        >
          {canDirect ? "Edit term plan" : "Term plan"}
        </Link>
      </div>

      <details
        open={params.envelopes === "1"}
        className="group rounded border border-line bg-white"
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-ink-700">
          <Badge
            variant={
              plan.status === "active" ? "success" : plan.status === "closed" ? "muted" : "neutral"
            }
          >
            {TERM_PLAN_STATUS_LABEL[plan.status]}
          </Badge>
          <span className="font-semibold text-ink-900">{plan.label}</span>
          <span>
            {formatDateShort(plan.starts_on)} – {formatDateShort(plan.ends_on)}
          </span>
          {classSummaries.length > 0 && (
            <span className="text-ink-500">
              · Open capacity {formatHours(totalCapacity(classSummaries).open)}
            </span>
          )}
          <span className="text-ink-500">
            · Airtime {envelope.availsPerWeek} avail{envelope.availsPerWeek === 1 ? "" : "s"} a week
          </span>
          <span className="flex-1" />
          <span className="text-xs font-bold text-brand-link group-open:hidden">
            Capacity and airtime ▾
          </span>
          <span className="hidden text-xs font-bold text-brand-link group-open:inline">Hide ▴</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-line p-4">
          {plan.status === "draft" && (
            <p className="text-xs text-ink-500">
              A draft: bookings can be placed, but the plan is not yet the term&apos;s plan of
              record.
            </p>
          )}
          {plan.notes && <p className="text-xs text-ink-500">{plan.notes}</p>}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CapacityPanel
              plan={plan}
              classes={classSummaries}
              months={months}
              canEdit={canDirect}
            />
            <AirtimePanel envelope={envelope} error={avails.error} asOf={read?.as_of ?? null} />
          </div>
        </div>
      </details>

      {params.error && <Alert>{params.error}</Alert>}

      {resourcedPools.length === 0 && (
        <Alert variant="note">
          The term plan has no resources yet, so nothing can be booked.{" "}
          {canDirect ? (
            <Link
              href={withQuery(PLAN_PATH, { plan: plan.id })}
              className="font-bold text-brand-link hover:underline"
            >
              Add each pool&apos;s units and windows on the term plan.
            </Link>
          ) : (
            "The director adds each pool's units and windows on the term plan."
          )}
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <FilterChips
            label="Pool"
            chips={[
              { label: "All pools", href: here({ pool: undefined }), active: poolFilter === null },
              ...resourcedPools.map((pool) => ({
                label: pool.name,
                href: here({ pool: pool.id }),
                active: poolFilter === pool.id,
              })),
            ]}
          />
          <span className="flex-1" />
          <ActionMenu
            label="More"
            items={[
              { label: "Find a slot", href: here({ check: "1" }) },
              ...(canDirect
                ? [
                    { label: "Add a blackout", href: here({ new: "blackout" }) },
                    { label: "Add a hold", href: here({ new: "hold" }) },
                  ]
                : []),
            ]}
          />
          {canSchedule && resourcedPools.length > 0 && (
            <PrimaryLink href={here({ new: "booking" })}>+ Booking</PrimaryLink>
          )}
        </div>

        {params.check === "1" && (
          <section className="rounded border border-line bg-white p-4">
            <h3 className="text-sm font-bold text-ink-900">Find a slot</h3>
            <p className="mt-0.5 text-xs text-ink-500">
              Runs the booking rule for one window without booking it: blackout or hold, the
              window&apos;s units free, room in each class&apos;s day, capacity for the pricing.
            </p>
            <form method="get" action={calendarHref({})} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="plan" value={plan.id} />
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="date" value={date} />
              {poolFilter && <input type="hidden" name="pool" value={poolFilter} />}
              <input type="hidden" name="check" value="1" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="c_pool">Pool</Label>
                  <Select id="c_pool" name="c_pool" defaultValue={params.c_pool ?? poolIds[0]}>
                    {resourcedPools.map((pool) => (
                      <option key={pool.id} value={pool.id}>
                        {pool.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="c_date">Date</Label>
                  <Input
                    id="c_date"
                    name="c_date"
                    type="date"
                    defaultValue={params.c_date ?? date}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="c_window">Window</Label>
                  <Select id="c_window" name="c_window" defaultValue={params.c_window ?? ""}>
                    {uniqueWindows.map((w) => (
                      <option key={`${w.start}-${w.end}`} value={`${w.start}-${w.end}`}>
                        {w.label} · {formatWindow(w.start, w.end)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="c_treatment">Pricing</Label>
                  <Select
                    id="c_treatment"
                    name="c_treatment"
                    defaultValue={params.c_treatment ?? "incremental"}
                  >
                    {TREATMENTS.map((t) => (
                      <option key={t} value={t}>
                        {PRODUCTION_RATE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {classesForHours.map((cls) => (
                  <div key={cls.id}>
                    <Label htmlFor={`c_hours_${cls.id}`}>{cls.name} hours</Label>
                    <Input
                      id={`c_hours_${cls.id}`}
                      name={`c_hours_${cls.id}`}
                      type="number"
                      step="0.25"
                      min="0"
                      defaultValue={params[`c_hours_${cls.id}`] ?? ""}
                    />
                  </div>
                ))}
                <div className="flex items-end gap-3">
                  <Button type="submit" variant="secondary">
                    Check
                  </Button>
                  <Link
                    href={here()}
                    className="pb-2.5 text-sm font-bold text-brand-link hover:underline"
                  >
                    Close
                  </Link>
                </div>
              </div>
            </form>
            {check && (
              <div className="mt-3">
                {check.result.ok ? (
                  <Alert variant="success">
                    Available: {poolName(check.request.pool_id)} on{" "}
                    {formatDateShort(check.request.date, true)},{" "}
                    {formatWindow(check.request.window_start, check.request.window_end)}.
                    {check.result.warnings.map((warning) => (
                      <span key={warning} className="block text-warning-fg">
                        {warning}
                      </span>
                    ))}
                  </Alert>
                ) : (
                  <Alert variant="warning">
                    Not available: {check.result.refusal.message}
                    {check.result.alternatives.length > 0 ? (
                      <span className="mt-1 block">
                        Nearest open windows on the same resource:{" "}
                        {check.result.alternatives
                          .map(
                            (a) =>
                              `${formatDateShort(a.date, true)} ${a.label} (${formatWindow(a.window_start, a.window_end)})`,
                          )
                          .join("; ")}
                        .
                      </span>
                    ) : (
                      <span className="mt-1 block">No open window nearby on this resource.</span>
                    )}
                  </Alert>
                )}
              </div>
            )}
          </section>
        )}

        {params.new === "blackout" && canDirect && (
          <InlineCreateCard
            title="Blackout"
            action={createBlackout}
            submitLabel="Add blackout"
            cancelHref={here()}
          >
            <input type="hidden" name="plan_id" value={plan.id} />
            <input type="hidden" name="return_to" value={here()} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="b_starts_on">First day</Label>
                <Input id="b_starts_on" name="starts_on" type="date" required defaultValue={date} />
              </div>
              <div>
                <Label htmlFor="b_ends_on">Last day</Label>
                <Input id="b_ends_on" name="ends_on" type="date" required defaultValue={date} />
              </div>
              <div>
                <Label htmlFor="b_reason">Reason</Label>
                <Input
                  id="b_reason"
                  name="reason"
                  required
                  maxLength={200}
                  placeholder="Spring pledge drive"
                />
              </div>
            </div>
            <fieldset className="mt-4">
              <legend className="text-xs font-bold text-ink-700">Pools</legend>
              <FieldHint>Leave every pool unchecked to black out all of them.</FieldHint>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {resourcedPools.map((pool) => (
                  <label key={pool.id} className="flex items-center gap-1.5 text-sm text-ink-900">
                    <input type="checkbox" name="pool_ids" value={pool.id} className="size-4" />
                    {pool.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </InlineCreateCard>
        )}

        {params.new === "hold" && canDirect && (
          <InlineCreateCard
            title="Hold for WUWF"
            action={createHold}
            submitLabel="Add hold"
            cancelHref={here()}
          >
            <input type="hidden" name="plan_id" value={plan.id} />
            <input type="hidden" name="return_to" value={here()} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="h_label">What for</Label>
                <Input
                  id="h_label"
                  name="label"
                  required
                  maxLength={200}
                  placeholder="Pledge drive production"
                />
              </div>
              <div>
                <Label htmlFor="h_kind">Kind</Label>
                <Select id="h_kind" name="kind" defaultValue="core">
                  <option value="core">{HOLD_KIND_LABEL.core}</option>
                  <option value="maintenance">{HOLD_KIND_LABEL.maintenance}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="h_pool">Pool</Label>
                <Select
                  id="h_pool"
                  name="pool_id"
                  defaultValue={poolFilter ?? resourcedPools[0]?.id ?? "none"}
                >
                  {resourcedPools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name}
                    </option>
                  ))}
                  <option value="none">No pool — labor hours only</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="h_date">Date</Label>
                <Input id="h_date" name="date" type="date" required defaultValue={date} />
              </div>
              <WindowFields prefix="h" windows={uniqueWindows} />
            </div>
            <HoursFields
              prefix="h"
              classes={classesForHours}
              hint="Taken from each class's day and from its net capacity."
            />
          </InlineCreateCard>
        )}

        {params.new === "booking" && canSchedule && (
          <InlineCreateCard
            title="Booking"
            action={createBooking}
            submitLabel="Book the window"
            cancelHref={here()}
          >
            <input type="hidden" name="plan_id" value={plan.id} />
            <input type="hidden" name="return_to" value={here()} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="k_label">Partner or work</Label>
                <Input
                  id="k_label"
                  name="label"
                  required
                  maxLength={200}
                  placeholder="OUR Voices recording session"
                />
                <FieldHint>
                  A booking made here stands alone; a project&apos;s estimate will place its own in
                  the next slice.
                </FieldHint>
              </div>
              <div>
                <Label htmlFor="k_status">Status</Label>
                <Select id="k_status" name="status" defaultValue="tentative">
                  <option value="tentative">Tentative — holds the window 14 days</option>
                  <option value="confirmed">Confirmed</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="k_pool">Pool</Label>
                <Select
                  id="k_pool"
                  name="pool_id"
                  defaultValue={poolFilter ?? resourcedPools[0]?.id ?? ""}
                >
                  {resourcedPools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="k_date">Date</Label>
                <Input
                  id="k_date"
                  name="date"
                  type="date"
                  required
                  defaultValue={date}
                  min={plan.starts_on}
                  max={plan.ends_on}
                />
              </div>
              <WindowFields prefix="k" windows={uniqueWindows} />
              <div>
                <Label htmlFor="k_treatment">Pricing</Label>
                <Select id="k_treatment" name="treatment" defaultValue="incremental">
                  {TREATMENTS.map((t) => (
                    <option key={t} value={t}>
                      {TREATMENT_LABEL[t]}
                    </option>
                  ))}
                </Select>
                <FieldHint>
                  Strategic draws each class&apos;s reserve; the others draw its open capacity.
                </FieldHint>
              </div>
            </div>
            <HoursFields
              prefix="k"
              classes={classesForHours}
              hint="The package's own figures; a basic webcast is 5 lead hours and 10 student hours."
            />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label htmlFor="k_notes">Notes</Label>
                <Textarea id="k_notes" name="notes" rows={2} maxLength={1000} />
              </div>
              {context.isExecutive && (
                <div className="sm:col-span-3">
                  <Label htmlFor="k_exception">Exception to the booking rule</Label>
                  <Input
                    id="k_exception"
                    name="exception_reason"
                    maxLength={500}
                    placeholder="Leave blank to apply the rule"
                  />
                  <FieldHint>
                    Executive only. With a reason the rule is not applied, and the exception is
                    recorded in the audit log.
                  </FieldHint>
                </div>
              )}
            </div>
          </InlineCreateCard>
        )}

        <CalendarGrid
          view={view}
          date={date}
          today={today}
          state={state}
          poolIds={poolIds}
          weekHref={weekHref}
          monthHref={monthHref}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-ink-900">
          In this {view}
          <span className="ml-2 text-xs font-normal text-ink-500">
            {bookingsInRange.length} booking{bookingsInRange.length === 1 ? "" : "s"} ·{" "}
            {holdsInRange.length} hold
            {holdsInRange.length === 1 ? "" : "s"} · {blackoutsInRange.length} blackout
            {blackoutsInRange.length === 1 ? "" : "s"}
          </span>
        </h3>
        {bookingsInRange.length + holdsInRange.length + blackoutsInRange.length === 0 ? (
          <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-500">
            Nothing is booked, held or blacked out in this {view}.
          </p>
        ) : (
          <TableFrame>
            <Table stack>
              <thead>
                <HeaderRow>
                  <Th>When</Th>
                  <Th>What</Th>
                  <Th>Pool</Th>
                  <Th>Hours</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </HeaderRow>
              </thead>
              <tbody>
                {blackoutsInRange.map((blackout) => (
                  <Row key={`blackout-${blackout.id}`}>
                    <Cell stack="title">
                      {formatDateShort(blackout.starts_on)}
                      {blackout.ends_on !== blackout.starts_on &&
                        ` – ${formatDateShort(blackout.ends_on)}`}
                    </Cell>
                    <Cell label="What">Blacked out: {blackout.reason}</Cell>
                    <Cell label="Pool">
                      {blackout.pool_ids === null
                        ? "Every pool"
                        : blackout.pool_ids.map((id) => poolName(id)).join(", ")}
                    </Cell>
                    <Cell label="Hours">—</Cell>
                    <Cell label="Status">
                      <Badge variant="danger">Blackout</Badge>
                    </Cell>
                    <Cell stack="aside" className="text-right">
                      {canDirect && (
                        <form action={deleteBlackout}>
                          <input type="hidden" name="id" value={blackout.id} />
                          <input type="hidden" name="return_to" value={here()} />
                          <Button type="submit" variant="ghost">
                            Remove
                          </Button>
                        </form>
                      )}
                    </Cell>
                  </Row>
                ))}
                {holdsInRange.map((hold) => (
                  <Row key={`hold-${hold.id}`}>
                    <Cell stack="title">
                      {formatDateShort(hold.date, true)} ·{" "}
                      {formatWindow(hold.window_start, hold.window_end)}
                    </Cell>
                    <Cell label="What">{hold.label}</Cell>
                    <Cell label="Pool">
                      {hold.pool_id ? poolName(hold.pool_id) : "Labor hours only"}
                    </Cell>
                    <Cell label="Hours" className="text-xs text-ink-700">
                      {describeHours(hold.hours, calendar.classes)}
                    </Cell>
                    <Cell label="Status">
                      <Badge variant={hold.kind === "core" ? "neutral" : "warning"}>
                        {HOLD_KIND_LABEL[hold.kind]}
                      </Badge>
                    </Cell>
                    <Cell stack="aside" className="text-right">
                      {canDirect && (
                        <form action={deleteHold}>
                          <input type="hidden" name="id" value={hold.id} />
                          <input type="hidden" name="return_to" value={here()} />
                          <Button type="submit" variant="ghost">
                            Remove
                          </Button>
                        </form>
                      )}
                    </Cell>
                  </Row>
                ))}
                {bookingsInRange.map((booking) => (
                  <Row key={`booking-${booking.id}`}>
                    <Cell stack="title">
                      {formatDateShort(booking.date, true)} ·{" "}
                      {formatWindow(booking.window_start, booking.window_end)}
                    </Cell>
                    <Cell label="What">
                      {booking.label}
                      <span className="block text-xs text-ink-500">
                        {PRODUCTION_RATE_LABEL[booking.treatment]}
                      </span>
                    </Cell>
                    <Cell label="Pool">{poolName(booking.pool_id)}</Cell>
                    <Cell label="Hours" className="text-xs text-ink-700">
                      {describeHours(booking.hours, calendar.classes)}
                      {totalHours(booking.hours) > 0 && (
                        <span className="block text-ink-400">
                          {totalHours(booking.hours)} h in all
                        </span>
                      )}
                    </Cell>
                    <Cell label="Status">
                      <Badge variant={booking.status === "confirmed" ? "success" : "accent"}>
                        {BOOKING_STATUS_LABEL[booking.status]}
                      </Badge>
                      {booking.status === "tentative" && booking.expires_at && (
                        <span className="block text-xs text-ink-500">
                          until {formatDateShort(booking.expires_at.slice(0, 10))}
                        </span>
                      )}
                    </Cell>
                    <Cell stack="aside" className="text-right">
                      {canSchedule && (
                        <span className="inline-flex gap-1">
                          {booking.status === "tentative" && (
                            <form action={confirmBooking}>
                              <input type="hidden" name="id" value={booking.id} />
                              <input type="hidden" name="return_to" value={here()} />
                              <Button type="submit" variant="ghost">
                                Confirm
                              </Button>
                            </form>
                          )}
                          <form action={releaseBooking}>
                            <input type="hidden" name="id" value={booking.id} />
                            <input type="hidden" name="return_to" value={here()} />
                            <Button type="submit" variant="ghost">
                              Release
                            </Button>
                          </form>
                        </span>
                      )}
                    </Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </section>
    </div>
  );
}

/** A window select (the pools' listed windows) with custom start/end times behind "Other". */
function WindowFields({
  prefix,
  windows,
}: {
  prefix: string;
  windows: { start: string; end: string; label: string }[];
}) {
  return (
    <>
      <div>
        <Label htmlFor={`${prefix}_window`}>Window</Label>
        <Select
          id={`${prefix}_window`}
          name="window"
          defaultValue={windows[0] ? `${windows[0].start}-${windows[0].end}` : "custom"}
        >
          {windows.map((w) => (
            <option key={`${w.start}-${w.end}`} value={`${w.start}-${w.end}`}>
              {w.label} · {formatClock(w.start)} – {formatClock(w.end)}
            </option>
          ))}
          <option value="custom">Other times…</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`${prefix}_start`}>Starts</Label>
          <Input id={`${prefix}_start`} name="window_start" type="time" />
        </div>
        <div>
          <Label htmlFor={`${prefix}_end`}>Ends</Label>
          <Input id={`${prefix}_end`} name="window_end" type="time" />
        </div>
        <FieldHint>Only read with &quot;Other times&quot;.</FieldHint>
      </div>
    </>
  );
}

/** One hours input per active labor class (`hours_<classId>`). */
function HoursFields({
  prefix,
  classes,
  hint,
}: {
  prefix: string;
  classes: BkLaborClassRow[];
  hint: string;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-xs font-bold text-ink-700">Hours per labor class</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {classes.map((cls) => (
          <div key={cls.id}>
            <Label htmlFor={`${prefix}_hours_${cls.id}`}>{cls.name}</Label>
            <Input
              id={`${prefix}_hours_${cls.id}`}
              name={`hours_${cls.id}`}
              type="number"
              step="0.25"
              min="0"
            />
          </div>
        ))}
      </div>
      <FieldHint>{hint}</FieldHint>
    </fieldset>
  );
}

function runCheck(params: Params, state: CalendarState) {
  const poolId = state.resources.some((r) => r.pool_id === params.c_pool)
    ? (params.c_pool as string)
    : null;
  const [start = "", end = ""] = (params.c_window ?? "").split("-");
  const treatment = TREATMENTS.includes((params.c_treatment ?? "") as BkPricingTreatment)
    ? (params.c_treatment as BkPricingTreatment)
    : null;
  if (!poolId || !isValidDateISO(params.c_date) || !start || !end || !treatment) return null;
  const hours: HoursByClass = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith("c_hours_") || typeof value !== "string") continue;
    const classId = key.slice("c_hours_".length);
    const asked = Number(value);
    if (UUID.test(classId) && Number.isFinite(asked) && asked > 0) hours[classId] = asked;
  }
  const request: BookingRequest = {
    pool_id: poolId,
    date: params.c_date,
    window_start: start,
    window_end: end,
    hours,
    treatment,
  };
  return { request, result: checkBooking(request, state) };
}
