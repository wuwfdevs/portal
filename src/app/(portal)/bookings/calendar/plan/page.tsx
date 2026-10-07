import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { TERM_PLAN_STATUS_LABEL } from "@/lib/bookings/labels";
import { PLAN_PATH, RATES_PATH, calendarHref, withQuery } from "@/lib/bookings/paths";
import {
  getPlanCalendar,
  listLaborClasses,
  listPlans,
  listPools,
  pickPlan,
  type BkTermPlanRow,
} from "@/lib/bookings/queries";
import {
  HOURS_PER_PROJECT_DAY,
  formatHours,
  formatWindow,
  formatWindowLines,
  parseWindows,
  windowsFor,
} from "@/lib/bookings/scheduling";
import { formatDateShort } from "@/lib/log/program-status";
import {
  createPlan,
  removeCapacity,
  removeResource,
  saveCapacity,
  setPlanStatus,
  updatePlan,
  updateResource,
} from "../actions";

type Params = { plan?: string; new?: string; edit?: string; capacity?: string; error?: string };

/**
 * The term plan (docs/bookings-design.md §8): the term's dates and the two
 * envelopes, each tracked labor class's capacity, then each pool's units,
 * concurrent units and windows. The director's screen; everyone else reads.
 * `?new=1` is the create form, `?capacity=<classId>` and `?edit=<poolId>`
 * open one row for editing.
 */
export default async function TermPlanPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const canEdit = context.isDirector;
  const [plans, classes, pools] = await Promise.all([listPlans(), listLaborClasses(), listPools()]);
  const plan = params.new === "1" ? null : pickPlan(plans, params.plan);
  const calendar = plan ? await getPlanCalendar(plan) : null;
  const activePools = pools.filter(
    (pool) => pool.active || calendar?.resources.some((r) => r.pool_id === pool.id),
  );
  const activeClasses = classes.filter(
    (cls) => cls.active || calendar?.capacity.some((row) => row.labor_class_id === cls.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-[17px] font-bold text-ink-900">Term plan</h2>
        {plans.length > 0 && (
          <FilterChips
            label="Term"
            chips={plans.map((candidate) => ({
              label: candidate.label,
              href: withQuery(PLAN_PATH, { plan: candidate.id }),
              active: candidate.id === plan?.id,
            }))}
          />
        )}
        <span className="flex-1" />
        {plan && (
          <Link
            href={calendarHref({ plan: plan.id })}
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            ← Calendar
          </Link>
        )}
        {canEdit && params.new !== "1" && (
          <Link
            href={withQuery(PLAN_PATH, { new: "1" })}
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            + New term
          </Link>
        )}
      </div>

      {params.error && <Alert>{params.error}</Alert>}

      {!plan ? (
        canEdit ? (
          <PlanForm
            action={createPlan}
            submitLabel="Create the term plan"
            cancelHref={plans[0] ? withQuery(PLAN_PATH, { plan: plans[0].id }) : calendarHref({})}
          />
        ) : (
          <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-500">
            No term plan yet. The Director of Operations creates it.
          </p>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-line bg-panel-50 px-4 py-3 text-sm text-ink-700">
            <Badge
              variant={
                plan.status === "active"
                  ? "success"
                  : plan.status === "closed"
                    ? "muted"
                    : "neutral"
              }
            >
              {TERM_PLAN_STATUS_LABEL[plan.status]}
            </Badge>
            <span>
              {plan.status === "active"
                ? "The term's plan of record; dates inside it book against it. Terms may be active together if their dates do not overlap."
                : plan.status === "closed"
                  ? "Closed and final. Kept for the term report; nothing new books against it and its figures cannot change. A correction is a new term plan."
                  : "A draft. Activate it when the figures are agreed."}
            </span>
            {canEdit && (
              <span className="flex basis-full flex-wrap items-center gap-2 pt-1">
                {plan.status !== "active" && (
                  <form action={setPlanStatus}>
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <input type="hidden" name="status" value="active" />
                    <Button type="submit">Activate</Button>
                  </form>
                )}
                {plan.status === "active" && (
                  <form action={setPlanStatus}>
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <input type="hidden" name="status" value="closed" />
                    <Button type="submit" variant="secondary">
                      Close the term
                    </Button>
                  </form>
                )}
              </span>
            )}
          </div>

          {canEdit ? (
            <PlanForm
              action={updatePlan}
              plan={plan}
              submitLabel="Save the term plan"
              cancelHref={calendarHref({ plan: plan.id })}
            />
          ) : (
            <PlanSummary plan={plan} />
          )}

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink-900">Capacity by labor class</h3>
                <p className="text-xs text-ink-500">
                  Each class the term tracks: the hours it has available for production work (a
                  project day is {HOURS_PER_PROJECT_DAY}), an optional reserve share of them, how
                  many people, and each person&apos;s hours a day. Strategic work draws the reserve;
                  everything else draws what is left after the reserve and any dated holds. A class
                  with no row is not capacity-checked.
                </p>
              </div>
              <Link
                href={`${RATES_PATH}/setup`}
                className="text-sm font-bold text-brand-link hover:underline"
              >
                Classes are kept under Rates · Setup
              </Link>
            </div>
            <TableFrame>
              <Table stack>
                <thead>
                  <HeaderRow>
                    <Th>Class</Th>
                    <Th className="text-right">Hours available</Th>
                    <Th className="text-right">Reserve</Th>
                    <Th className="text-right">People</Th>
                    <Th className="text-right">Hours a day each</Th>
                    <Th className="text-right">Day capacity</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {activeClasses.map((cls) => {
                    const row = calendar?.capacity.find((c) => c.labor_class_id === cls.id) ?? null;
                    if (canEdit && params.capacity === cls.id) {
                      return (
                        <Row key={cls.id}>
                          <Cell stack="full" colSpan={7}>
                            <form action={saveCapacity} className="flex flex-col gap-3 py-1">
                              <input type="hidden" name="plan_id" value={plan.id} />
                              <input type="hidden" name="labor_class_id" value={cls.id} />
                              <div className="text-sm font-semibold text-ink-900">{cls.name}</div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                  <Label htmlFor="net_hours">Hours available this term</Label>
                                  <Input
                                    id="net_hours"
                                    name="net_hours"
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    required
                                    autoFocus
                                    defaultValue={row ? String(row.net_hours) : "800"}
                                  />
                                  <FieldHint>
                                    Hours this class can give production work in the term, with
                                    undated core WUWF work already left out. Dated holds come off
                                    this number, so do not leave those out too. The workbook&apos;s
                                    100 days is a year (800 hours); a term takes its share.
                                  </FieldHint>
                                </div>
                                <div>
                                  <Label htmlFor="reserve_percent">Reserve share (%)</Label>
                                  <Input
                                    id="reserve_percent"
                                    name="reserve_percent"
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="100"
                                    defaultValue={
                                      row && row.reserve_share !== null
                                        ? String(Math.round(Number(row.reserve_share) * 1000) / 10)
                                        : ""
                                    }
                                  />
                                  <FieldHint>
                                    The share of those hours WUWF contributes to strategic
                                    university work; strategic work inside it is comped. Leave blank
                                    for none (student and OPS crews, which partners pay for).
                                    {cls.charged_in_strategic
                                      ? " This class is charged in a strategic price, so a share here is rarely right."
                                      : ""}
                                  </FieldHint>
                                </div>
                                <div>
                                  <Label htmlFor="headcount">People</Label>
                                  <Input
                                    id="headcount"
                                    name="headcount"
                                    type="number"
                                    step="1"
                                    min="1"
                                    required
                                    defaultValue={row ? String(row.headcount) : "1"}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="hours_per_person_day">Hours a day each</Label>
                                  <Input
                                    id="hours_per_person_day"
                                    name="hours_per_person_day"
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="24"
                                    required
                                    defaultValue={row ? String(row.hours_per_person_day) : "8"}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Button type="submit">Save</Button>
                                <Link
                                  href={withQuery(PLAN_PATH, { plan: plan.id })}
                                  className="px-1 text-sm font-bold text-brand-link hover:underline"
                                >
                                  Cancel
                                </Link>
                              </div>
                            </form>
                          </Cell>
                        </Row>
                      );
                    }
                    return (
                      <Row key={cls.id} className={cls.active ? undefined : "text-ink-400"}>
                        <Cell stack="title">
                          {cls.name}
                          {!cls.active && (
                            <Badge variant="muted" className="ml-2">
                              Retired
                            </Badge>
                          )}
                        </Cell>
                        <Cell label="Hours available" className="text-right">
                          {row ? (
                            formatHours(Number(row.net_hours))
                          ) : (
                            <span className="text-ink-400">Not tracked</span>
                          )}
                        </Cell>
                        <Cell label="Reserve" className="text-right">
                          {row && row.reserve_share !== null ? (
                            `${Math.round(Number(row.reserve_share) * 1000) / 10}% · ${formatHours(
                              Math.round(Number(row.net_hours) * Number(row.reserve_share) * 100) /
                                100,
                            )}`
                          ) : row ? (
                            <span className="text-ink-400">None</span>
                          ) : (
                            "—"
                          )}
                        </Cell>
                        <Cell label="People" className="text-right">
                          {row ? row.headcount : "—"}
                        </Cell>
                        <Cell label="Hours a day each" className="text-right">
                          {row ? Number(row.hours_per_person_day) : "—"}
                        </Cell>
                        <Cell label="Day capacity" className="text-right">
                          {row
                            ? `${Number(row.headcount) * Number(row.hours_per_person_day)} h`
                            : "—"}
                        </Cell>
                        <Cell stack="aside" className="text-right">
                          {canEdit && (
                            <span className="inline-flex items-center gap-3">
                              <Link
                                href={withQuery(PLAN_PATH, { plan: plan.id, capacity: cls.id })}
                                className="text-sm font-bold text-brand-link hover:underline"
                              >
                                {row ? "Edit" : "Track"}
                              </Link>
                              {row && (
                                <form action={removeCapacity}>
                                  <input type="hidden" name="plan_id" value={plan.id} />
                                  <input type="hidden" name="id" value={row.id} />
                                  <Button
                                    type="submit"
                                    variant="ghost"
                                    className="text-xs text-ink-500"
                                  >
                                    Stop tracking
                                  </Button>
                                </form>
                              )}
                            </span>
                          )}
                        </Cell>
                      </Row>
                    );
                  })}
                </tbody>
              </Table>
            </TableFrame>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink-900">Resources and windows</h3>
                <p className="text-xs text-ink-500">
                  Each pool&apos;s units for the term, how many bookings it takes in one window, and
                  the windows a booking may take. Units are availability constraints on the
                  calendar; the guardrail is labor hours.
                </p>
              </div>
              <Link
                href={`${RATES_PATH}/setup`}
                className="text-sm font-bold text-brand-link hover:underline"
              >
                Pools are kept under Rates · Setup
              </Link>
            </div>
            <TableFrame>
              <Table stack>
                <thead>
                  <HeaderRow>
                    <Th>Pool</Th>
                    <Th className="text-right">Practical capacity</Th>
                    <Th className="text-right">At a time</Th>
                    <Th>Windows</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {activePools.map((pool) => {
                    const resource = calendar?.resources.find((r) => r.pool_id === pool.id) ?? null;
                    const windows = resource ? parseWindows(resource.windows) : [];
                    const defaults = parseWindows(pool.default_windows);
                    if (canEdit && params.edit === pool.id) {
                      return (
                        <Row key={pool.id}>
                          <Cell stack="full" colSpan={5}>
                            <form action={updateResource} className="flex flex-col gap-3 py-1">
                              <input type="hidden" name="plan_id" value={plan.id} />
                              <input type="hidden" name="pool_id" value={pool.id} />
                              <div className="text-sm font-semibold text-ink-900">{pool.name}</div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
                                <div>
                                  <Label htmlFor="available_units">
                                    Practical capacity, {pool.unit_label}s this term
                                  </Label>
                                  <Input
                                    id="available_units"
                                    name="available_units"
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    required
                                    autoFocus
                                    defaultValue={resource ? String(resource.available_units) : "0"}
                                  />
                                  <FieldHint>
                                    What it can realistically deliver this term after downtime —
                                    not expected bookings.
                                  </FieldHint>
                                </div>
                                <div>
                                  <Label htmlFor="concurrent_units">Bookings at a time</Label>
                                  <Input
                                    id="concurrent_units"
                                    name="concurrent_units"
                                    type="number"
                                    step="1"
                                    min="1"
                                    required
                                    defaultValue={
                                      resource ? String(resource.concurrent_units) : "1"
                                    }
                                  />
                                  <FieldHint>
                                    Two field kits take two bookings in one window.
                                  </FieldHint>
                                </div>
                                <div>
                                  <Label htmlFor="windows">Windows, one per line</Label>
                                  <Textarea
                                    id="windows"
                                    name="windows"
                                    rows={4}
                                    required
                                    defaultValue={formatWindowLines(
                                      windowsFor(
                                        resource
                                          ? {
                                              pool_id: pool.id,
                                              available_units: 0,
                                              concurrent_units: 1,
                                              windows,
                                            }
                                          : undefined,
                                        defaults,
                                      ),
                                    )}
                                  />
                                  <FieldHint>
                                    A label and 24-hour times: &quot;Morning 08:00–12:00&quot;.
                                  </FieldHint>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Button type="submit">Save</Button>
                                <Link
                                  href={withQuery(PLAN_PATH, { plan: plan.id })}
                                  className="px-1 text-sm font-bold text-brand-link hover:underline"
                                >
                                  Cancel
                                </Link>
                              </div>
                            </form>
                          </Cell>
                        </Row>
                      );
                    }
                    return (
                      <Row key={pool.id} className={pool.active ? undefined : "text-ink-400"}>
                        <Cell stack="title">
                          {pool.name}
                          {!pool.active && (
                            <Badge variant="muted" className="ml-2">
                              Retired
                            </Badge>
                          )}
                        </Cell>
                        <Cell label="Practical capacity" className="text-right">
                          {resource ? (
                            `${resource.available_units} ${pool.unit_label}s`
                          ) : (
                            <span className="text-ink-400">Not on this term</span>
                          )}
                        </Cell>
                        <Cell label="At a time" className="text-right">
                          {resource ? resource.concurrent_units : "—"}
                        </Cell>
                        <Cell label="Windows">
                          {windows.length > 0 ? (
                            windows
                              .map((w) => `${w.label} ${formatWindow(w.start, w.end)}`)
                              .join(" · ")
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </Cell>
                        <Cell stack="aside" className="text-right">
                          {canEdit && (
                            <span className="inline-flex items-center gap-3">
                              <Link
                                href={withQuery(PLAN_PATH, { plan: plan.id, edit: pool.id })}
                                className="text-sm font-bold text-brand-link hover:underline"
                              >
                                {resource ? "Edit" : "Add to this term"}
                              </Link>
                              {resource && (
                                <form action={removeResource}>
                                  <input type="hidden" name="plan_id" value={plan.id} />
                                  <input type="hidden" name="id" value={resource.id} />
                                  <Button
                                    type="submit"
                                    variant="ghost"
                                    className="text-xs text-ink-500"
                                  >
                                    Remove
                                  </Button>
                                </form>
                              )}
                            </span>
                          )}
                        </Cell>
                      </Row>
                    );
                  })}
                </tbody>
              </Table>
            </TableFrame>
          </section>
        </>
      )}
    </div>
  );
}

function PlanSummary({ plan }: { plan: BkTermPlanRow }) {
  const items: [string, string][] = [
    ["Term", `${formatDateShort(plan.starts_on)} – ${formatDateShort(plan.ends_on)}`],
    ["Contributed airtime", `${plan.airtime_contributed_minutes_per_week} min a week`],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded border border-line bg-white px-4 py-3 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex justify-between gap-4 border-b border-line py-1.5 last:border-b-0"
        >
          <dt className="text-ink-500">{label}</dt>
          <dd className="font-semibold text-ink-900">{value}</dd>
        </div>
      ))}
      {plan.notes && <p className="text-xs text-ink-500 sm:col-span-2">{plan.notes}</p>}
    </dl>
  );
}

function PlanForm({
  action,
  plan,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  plan?: BkTermPlanRow;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4 rounded border border-line bg-white p-4">
      {plan && <input type="hidden" name="plan_id" value={plan.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="label">Term</Label>
          <Input
            id="label"
            name="label"
            required
            maxLength={80}
            defaultValue={plan?.label ?? ""}
            placeholder="Spring 2027"
          />
        </div>
        <div>
          <Label htmlFor="starts_on">First day</Label>
          <Input
            id="starts_on"
            name="starts_on"
            type="date"
            required
            defaultValue={plan?.starts_on ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="ends_on">Last day</Label>
          <Input
            id="ends_on"
            name="ends_on"
            type="date"
            required
            defaultValue={plan?.ends_on ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="airtime_contributed_minutes_per_week">
            Contributed airtime, minutes a week
          </Label>
          <Input
            id="airtime_contributed_minutes_per_week"
            name="airtime_contributed_minutes_per_week"
            type="number"
            step="1"
            min="0"
            required
            defaultValue={plan ? String(plan.airtime_contributed_minutes_per_week) : "0"}
          />
          <FieldHint>The executive&apos;s envelope of university-eligible avail time.</FieldHint>
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={plan?.notes ?? ""}
          />
        </div>
      </div>
      {!plan && (
        <FieldHint>
          A new plan starts with a resource for each pool that has default windows; set units, then
          track each class&apos;s capacity below.
        </FieldHint>
      )}
      <div className="flex items-center gap-4">
        <Button type="submit">{submitLabel}</Button>
        <Link href={cancelHref} className="px-1 text-sm font-bold text-brand-link hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
