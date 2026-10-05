import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { airtimeEnvelope, parseAirtimeRead } from "@/lib/bookings/airtime";
import {
  BOOKING_STATUS_LABEL,
  HOLD_KIND_LABEL,
  TERM_PLAN_STATUS_LABEL,
  TREATMENT_LABEL,
  TREATMENT_SHORT_LABEL,
} from "@/lib/bookings/labels";
import { PLAN_PATH, calendarHref, withQuery } from "@/lib/bookings/paths";
import {
  getPlanCalendar,
  listPlans,
  pickPlan,
  readUniversityAvails,
  type PlanCalendar,
} from "@/lib/bookings/queries";
import { POOL_KEYS, POOL_LABEL, type PoolKey } from "@/lib/bookings/rates";
import {
  DEFAULT_WINDOWS,
  bookingIsLive,
  capacitySummary,
  checkBooking,
  formatClock,
  formatWindow,
  monthlyCapacity,
  parseWindows,
  toHHMM,
  type BookingRequest,
  type CalendarState,
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
  c_pool?: string;
  c_date?: string;
  c_window?: string;
  c_hours?: string;
  c_treatment?: string;
};

const TREATMENTS: readonly BkPricingTreatment[] = ["strategic", "incremental", "external"];

/** The database rows as the pure modules' shapes ("HH:MM" times, typed windows). */
function stateFrom(calendar: PlanCalendar, nowISO: string): CalendarState {
  return {
    plan: calendar.plan,
    resources: calendar.resources.map((r) => ({
      pool: r.pool,
      available_units: Number(r.available_units),
      unit_label: r.unit_label,
      windows: parseWindows(r.windows),
    })),
    blackouts: calendar.blackouts,
    holds: calendar.holds.map((h) => ({
      ...h,
      window_start: toHHMM(h.window_start),
      window_end: toHHMM(h.window_end),
      professional_hours: Number(h.professional_hours),
    })),
    bookings: calendar.bookings.map((b) => ({
      ...b,
      window_start: toHHMM(b.window_start),
      window_end: toHHMM(b.window_end),
      professional_hours: Number(b.professional_hours),
    })),
    nowISO,
  };
}

/**
 * The Calendar tab (docs/bookings-design.md §4): the term's two envelopes,
 * then the week or month picture of every resource, with the director's
 * blackouts and holds and the lead's bookings. View, date, pool and the
 * open create card are query-string state; every write is a form.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const today = stationTodayISO();
  const plans = await listPlans();
  const plan = pickPlan(plans, params.plan);
  const canDirect = context.isDirector;
  const canSchedule = context.isLead || context.isDirector || context.isExecutive;

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-[17px] font-bold text-ink-900">Calendar</h2>
        <div className="rounded border border-dashed border-line bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink-900">No term plan yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
            The calendar starts from a term plan: the term&apos;s dates, its net professional hours,
            the reserve, the airtime the station contributes, and each pool&apos;s units and
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
  const poolFilter = (POOL_KEYS as readonly string[]).includes(params.pool ?? "")
    ? (params.pool as PoolKey)
    : null;

  const nowISO = new Date().toISOString();
  const [calendar, avails] = await Promise.all([
    getPlanCalendar(plan),
    readUniversityAvails(plan.id),
  ]);
  const state = stateFrom(calendar, nowISO);
  const capacity = capacitySummary(plan, state.holds, state.bookings, nowISO);
  const months = monthlyCapacity(state);
  const read = parseAirtimeRead(avails.payload);
  const envelope = airtimeEnvelope(read, plan.airtime_contributed_minutes_per_week);

  const pools = (
    state.resources.length > 0 ? state.resources.map((r) => r.pool) : [...POOL_KEYS]
  ).filter((pool) => poolFilter === null || pool === poolFilter);
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
  const poolMatches = (pool: PoolKey | null) =>
    poolFilter === null || pool === null || pool === poolFilter;
  const blackoutsInRange = state.blackouts.filter(
    (b) =>
      b.starts_on <= rangeEnd &&
      b.ends_on >= rangeStart &&
      (b.pools === null || b.pools.some((p) => poolMatches(p))),
  );
  const holdsInRange = state.holds.filter((h) => inRange(h.date) && poolMatches(h.pool));
  const bookingsInRange = state.bookings.filter(
    (b) => inRange(b.date) && poolMatches(b.pool) && bookingIsLive(b, nowISO),
  );
  const windowOptions = (pool: PoolKey) => {
    const resource = state.resources.find((r) => r.pool === pool);
    return resource && resource.windows.length > 0 ? resource.windows : DEFAULT_WINDOWS[pool];
  };
  const allWindows = pools.flatMap((pool) => windowOptions(pool).map((w) => ({ pool, ...w })));
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
        {canDirect && (
          <Link
            href={withQuery(PLAN_PATH, { plan: plan.id })}
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            Term plan
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-line bg-panel-50 px-4 py-3 text-sm text-ink-700">
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
        {plan.status === "draft" && (
          <span className="text-xs text-ink-500">
            A draft: bookings can be placed, but the plan is not yet the term&apos;s plan of record.
          </span>
        )}
        {plan.notes && <span className="basis-full text-xs text-ink-500">{plan.notes}</span>}
      </div>

      {params.error && <Alert>{params.error}</Alert>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CapacityPanel plan={plan} capacity={capacity} months={months} canEdit={canDirect} />
        <AirtimePanel envelope={envelope} error={avails.error} asOf={read?.as_of ?? null} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <FilterChips
            label="Pool"
            chips={[
              { label: "All pools", href: here({ pool: undefined }), active: poolFilter === null },
              ...POOL_KEYS.filter(
                (pool) =>
                  state.resources.some((r) => r.pool === pool) || state.resources.length === 0,
              ).map((pool) => ({
                label: POOL_LABEL[pool],
                href: here({ pool }),
                active: poolFilter === pool,
              })),
            ]}
          />
          <span className="flex-1" />
          <Link
            href={here({ check: "1" })}
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            Find a slot
          </Link>
          {canDirect && (
            <>
              <Link
                href={here({ new: "blackout" })}
                className="px-1 text-sm font-bold text-brand-link hover:underline"
              >
                + Blackout
              </Link>
              <Link
                href={here({ new: "hold" })}
                className="px-1 text-sm font-bold text-brand-link hover:underline"
              >
                + Hold
              </Link>
            </>
          )}
          {canSchedule && <PrimaryLink href={here({ new: "booking" })}>+ Booking</PrimaryLink>}
        </div>

        {params.check === "1" && (
          <section className="rounded border border-line bg-white p-4">
            <h3 className="text-sm font-bold text-ink-900">Find a slot</h3>
            <p className="mt-0.5 text-xs text-ink-500">
              Runs the booking rule for one window without booking it: blackout or hold, window
              free, room in the lead&apos;s day, capacity for the pricing.
            </p>
            <form
              method="get"
              action={calendarHref({})}
              className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6"
            >
              <input type="hidden" name="plan" value={plan.id} />
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="date" value={date} />
              {poolFilter && <input type="hidden" name="pool" value={poolFilter} />}
              <input type="hidden" name="check" value="1" />
              <div>
                <Label htmlFor="c_pool">Pool</Label>
                <Select id="c_pool" name="c_pool" defaultValue={params.c_pool ?? pools[0]}>
                  {(state.resources.length > 0
                    ? state.resources.map((r) => r.pool)
                    : [...POOL_KEYS]
                  ).map((pool) => (
                    <option key={pool} value={pool}>
                      {POOL_LABEL[pool]}
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
                <Label htmlFor="c_hours">Pro hours</Label>
                <Input
                  id="c_hours"
                  name="c_hours"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue={params.c_hours ?? "5"}
                />
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
                      {TREATMENT_SHORT_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </div>
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
            </form>
            {check && (
              <div className="mt-3">
                {check.result.ok ? (
                  <Alert variant="success">
                    Available: {POOL_LABEL[check.request.pool]} on{" "}
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
                {POOL_KEYS.map((pool) => (
                  <label key={pool} className="flex items-center gap-1.5 text-sm text-ink-900">
                    <input type="checkbox" name="pools" value={pool} className="size-4" />
                    {POOL_LABEL[pool]}
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
                <Select id="h_pool" name="pool" defaultValue={poolFilter ?? "studio"}>
                  {POOL_KEYS.map((pool) => (
                    <option key={pool} value={pool}>
                      {POOL_LABEL[pool]}
                    </option>
                  ))}
                  <option value="none">No pool — the lead&apos;s hours only</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="h_date">Date</Label>
                <Input id="h_date" name="date" type="date" required defaultValue={date} />
              </div>
              <WindowFields prefix="h" windows={uniqueWindows} />
              <div>
                <Label htmlFor="h_hours">Lead&apos;s hours</Label>
                <Input
                  id="h_hours"
                  name="professional_hours"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue="4"
                  required
                />
                <FieldHint>Taken from the lead&apos;s day and from net capacity.</FieldHint>
              </div>
            </div>
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
                <Select id="k_pool" name="pool" defaultValue={poolFilter ?? pools[0] ?? "studio"}>
                  {(state.resources.length > 0
                    ? state.resources.map((r) => r.pool)
                    : [...POOL_KEYS]
                  ).map((pool) => (
                    <option key={pool} value={pool}>
                      {POOL_LABEL[pool]}
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
                <Label htmlFor="k_hours">Professional hours</Label>
                <Input
                  id="k_hours"
                  name="professional_hours"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue="5"
                  required
                />
                <FieldHint>The package&apos;s own figure; a basic webcast is 5.</FieldHint>
              </div>
              <div>
                <Label htmlFor="k_treatment">Pricing</Label>
                <Select id="k_treatment" name="treatment" defaultValue="incremental">
                  {TREATMENTS.map((t) => (
                    <option key={t} value={t}>
                      {TREATMENT_LABEL[t]}
                    </option>
                  ))}
                </Select>
                <FieldHint>Strategic draws the reserve; the others draw open capacity.</FieldHint>
              </div>
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
          pools={pools}
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
                  <Th className="text-right">Pro hours</Th>
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
                      {blackout.pools === null
                        ? "Every pool"
                        : blackout.pools.map((p) => POOL_LABEL[p]).join(", ")}
                    </Cell>
                    <Cell label="Pro hours" className="text-right">
                      —
                    </Cell>
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
                      {hold.pool ? POOL_LABEL[hold.pool] : "Lead's hours only"}
                    </Cell>
                    <Cell label="Pro hours" className="text-right">
                      {hold.professional_hours}
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
                        {TREATMENT_SHORT_LABEL[booking.treatment]}
                      </span>
                    </Cell>
                    <Cell label="Pool">{POOL_LABEL[booking.pool]}</Cell>
                    <Cell label="Pro hours" className="text-right">
                      {booking.professional_hours}
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

function runCheck(params: Params, state: CalendarState) {
  const pool = (POOL_KEYS as readonly string[]).includes(params.c_pool ?? "")
    ? (params.c_pool as PoolKey)
    : null;
  const [start = "", end = ""] = (params.c_window ?? "").split("-");
  const hours = Number(params.c_hours ?? "");
  const treatment = TREATMENTS.includes((params.c_treatment ?? "") as BkPricingTreatment)
    ? (params.c_treatment as BkPricingTreatment)
    : null;
  if (
    !pool ||
    !isValidDateISO(params.c_date) ||
    !start ||
    !end ||
    !Number.isFinite(hours) ||
    !treatment
  ) {
    return null;
  }
  const request: BookingRequest = {
    pool,
    date: params.c_date,
    window_start: start,
    window_end: end,
    professional_hours: hours,
    treatment,
  };
  return { request, result: checkBooking(request, state) };
}
