import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { TERM_PLAN_STATUS_LABEL } from "@/lib/bookings/labels";
import { PLAN_PATH, calendarHref, withQuery } from "@/lib/bookings/paths";
import { getPlanCalendar, listPlans, pickPlan, type BkTermPlanRow } from "@/lib/bookings/queries";
import { POOL_KEYS, POOL_LABEL } from "@/lib/bookings/rates";
import {
  DEFAULT_UNIT_LABEL,
  DEFAULT_WINDOWS,
  HOURS_PER_PROJECT_DAY,
  formatHours,
  formatWindow,
  formatWindowLines,
  parseWindows,
} from "@/lib/bookings/scheduling";
import { formatDateShort } from "@/lib/log/program-status";
import { createPlan, setPlanStatus, updatePlan, updateResource } from "../actions";

type Params = { plan?: string; new?: string; edit?: string; error?: string };

/**
 * The term plan (docs/bookings-design.md §8): the term's dates and its two
 * envelopes, then each pool's units and windows. The director's screen;
 * everyone else reads. `?new=1` is the create form, `?edit=<pool>` opens
 * one resource's row for editing.
 */
export default async function TermPlanPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const canEdit = context.isDirector;
  const plans = await listPlans();
  const plan = params.new === "1" ? null : pickPlan(plans, params.plan);
  const calendar = plan ? await getPlanCalendar(plan) : null;

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
                ? "The term's plan of record; the calendar books against it."
                : plan.status === "closed"
                  ? "Closed. Kept for the term report; nothing new books against it."
                  : "A draft. Activate it when the figures are agreed; only one plan is active at a time."}
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
                {plan.status === "closed" && (
                  <form action={setPlanStatus}>
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <input type="hidden" name="status" value="draft" />
                    <Button type="submit" variant="secondary">
                      Reopen as a draft
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
            <div>
              <h3 className="text-sm font-bold text-ink-900">Resources and windows</h3>
              <p className="text-xs text-ink-500">
                Each pool&apos;s units for the term and the windows a booking may take. Units are
                availability constraints on the calendar; the guardrail is professional hours.
              </p>
            </div>
            <TableFrame>
              <Table stack>
                <thead>
                  <HeaderRow>
                    <Th>Pool</Th>
                    <Th className="text-right">Available units</Th>
                    <Th>Windows</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {POOL_KEYS.map((pool) => {
                    const resource = calendar?.resources.find((r) => r.pool === pool) ?? null;
                    const windows = resource ? parseWindows(resource.windows) : [];
                    if (canEdit && params.edit === pool) {
                      return (
                        <Row key={pool}>
                          <Cell stack="full" colSpan={4}>
                            <form action={updateResource} className="flex flex-col gap-3 py-1">
                              <input type="hidden" name="plan_id" value={plan.id} />
                              <input type="hidden" name="pool" value={pool} />
                              <div className="text-sm font-semibold text-ink-900">
                                {POOL_LABEL[pool]}
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
                                <div>
                                  <Label htmlFor="available_units">Available units</Label>
                                  <Input
                                    id="available_units"
                                    name="available_units"
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    required
                                    defaultValue={resource ? String(resource.available_units) : "0"}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="unit_label">Unit</Label>
                                  <Input
                                    id="unit_label"
                                    name="unit_label"
                                    required
                                    maxLength={40}
                                    defaultValue={resource?.unit_label ?? DEFAULT_UNIT_LABEL[pool]}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="windows">Windows, one per line</Label>
                                  <Textarea
                                    id="windows"
                                    name="windows"
                                    rows={4}
                                    required
                                    defaultValue={formatWindowLines(
                                      windows.length > 0 ? windows : DEFAULT_WINDOWS[pool],
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
                      <Row key={pool}>
                        <Cell stack="title">{POOL_LABEL[pool]}</Cell>
                        <Cell label="Available units" className="text-right">
                          {resource ? (
                            `${resource.available_units} ${resource.unit_label}`
                          ) : (
                            <span className="text-ink-400">Not set</span>
                          )}
                        </Cell>
                        <Cell label="Windows">
                          {windows.length > 0 ? (
                            windows
                              .map((w) => `${w.label} ${formatWindow(w.start, w.end)}`)
                              .join(" · ")
                          ) : (
                            <span className="text-ink-400">Defaults</span>
                          )}
                        </Cell>
                        <Cell stack="aside" className="text-right">
                          {canEdit && (
                            <Link
                              href={withQuery(PLAN_PATH, { plan: plan.id, edit: pool })}
                              className="text-sm font-bold text-brand-link hover:underline"
                            >
                              Edit
                            </Link>
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
    ["Net professional hours", formatHours(Number(plan.net_professional_hours))],
    ["Reserve share", `${Math.round(Number(plan.reserve_share) * 1000) / 10}%`],
    ["Contributed airtime", `${plan.airtime_contributed_minutes_per_week} min a week`],
    ["Lead's hours a day", String(plan.lead_hours_per_day)],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded border border-line bg-white px-4 py-3 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex justify-between gap-4 border-b border-line py-1.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
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
  const netDays = plan ? Number(plan.net_professional_hours) / HOURS_PER_PROJECT_DAY : null;
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
          <Label htmlFor="net_professional_hours">Net professional hours</Label>
          <Input
            id="net_professional_hours"
            name="net_professional_hours"
            type="number"
            step="0.5"
            min="0"
            required
            defaultValue={plan ? String(plan.net_professional_hours) : "800"}
          />
          <FieldHint>
            A project day is 8 hours; the framework&apos;s placeholder is 100 days = 800 hours.
            {netDays !== null && ` Now ${Math.round(netDays * 100) / 100} days.`}
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="reserve_percent">Reserve share</Label>
          <Input
            id="reserve_percent"
            name="reserve_percent"
            type="number"
            step="0.5"
            min="0"
            max="100"
            required
            defaultValue={plan ? String(Math.round(Number(plan.reserve_share) * 1000) / 10) : "15"}
          />
          <FieldHint>
            Percent of net kept for strategic work: the station&apos;s contribution.
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="lead_hours_per_day">Lead&apos;s hours a day</Label>
          <Input
            id="lead_hours_per_day"
            name="lead_hours_per_day"
            type="number"
            step="0.5"
            min="0.5"
            max="24"
            required
            defaultValue={plan ? String(plan.lead_hours_per_day) : "8"}
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
        <div className="sm:col-span-2">
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
      <div className="flex items-center gap-4">
        <Button type="submit">{submitLabel}</Button>
        <Link href={cancelHref} className="px-1 text-sm font-bold text-brand-link hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
