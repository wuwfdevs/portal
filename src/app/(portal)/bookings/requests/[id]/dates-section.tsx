import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { BOOKING_STATUS_LABEL } from "@/lib/bookings/labels";
import { CALENDAR_PATH, requestHref } from "@/lib/bookings/paths";
import { BLOCK_STATE_LABEL } from "@/lib/bookings/agreements";
import type {
  BkLaborClassRow,
  PlanCalendar,
  ProjectDetail,
  ReservedBlockDetail,
} from "@/lib/bookings/queries";
import {
  checkBooking,
  formatWindow,
  parseWindows,
  toHHMM,
  windowsFor,
  type BookingCheck,
  type CalendarState,
  type HoursByClass,
} from "@/lib/bookings/scheduling";
import { formatDateShort } from "@/lib/log/program-status";
import { addPlannedDate, attachReservedBlock, removeDate } from "../actions";
import { TextLink } from "@/components/ui/primary-link";
import { EmptyState } from "@/components/ui/empty-state";

export interface DateCheck {
  bookingId: string;
  result: BookingCheck | null;
}

/**
 * The capacity check for each of a project's planned dates (§6.4): a
 * planned date is checked against the calendar of the term it falls in as it
 * stands now, excluding itself; a sent or confirmed hold has already passed
 * and is not re-run.
 */
export function checkPlannedDates(
  detail: ProjectDetail,
  stateFor: (date: string) => CalendarState | null,
): DateCheck[] {
  return detail.bookings
    .filter((b) => b.status !== "released")
    .map((booking) => {
      const state = booking.status === "planned" ? stateFor(booking.date) : null;
      return {
        bookingId: booking.id,
        result:
          state !== null
            ? checkBooking(
                {
                  pool_id: booking.pool_id,
                  date: booking.date,
                  window_start: toHHMM(booking.window_start),
                  window_end: toHHMM(booking.window_end),
                  hours: booking.hours,
                  treatment: detail.project.priced_as ?? booking.treatment,
                  excludeBookingId: booking.id,
                  partnerId: detail.project.partner_id,
                },
                state,
              )
            : null,
      };
    });
}

/**
 * The project's dates (docs/bookings-design.md §3D–E): planned before the
 * estimate goes out, tentative while it is out, confirmed once approved.
 * The capacity check reads as one line with "show the check".
 */
export function DatesSection({
  detail,
  calendar,
  state,
  checks,
  draw,
  canEdit,
  openCard,
  attachableBlocks,
}: {
  detail: ProjectDetail;
  calendar: PlanCalendar | null;
  state: CalendarState | null;
  checks: DateCheck[];
  /** The estimate's hours per class, prefilled into the first date. */
  draw: HoursByClass;
  canEdit: boolean;
  /** `?new=date` or `?new=block` */
  openCard: "date" | "block" | null;
  /** The agreement's blocks this project could still take (slice 5); empty without an agreement. */
  attachableBlocks: ReservedBlockDetail[];
}) {
  const { project } = detail;
  const here = requestHref(project.id);
  const dates = detail.bookings.filter((b) => b.status !== "released");
  const released = detail.bookings.filter((b) => b.status === "released");
  const planned = checks.filter((c) => c.result !== null);
  const failing = planned.filter((c) => c.result && !c.result.ok);
  const warnings = planned.flatMap((c) => (c.result?.ok ? c.result.warnings : []));
  const poolName = (id: string) => calendar?.pools.find((p) => p.id === id)?.name ?? "Pool";
  const classes: BkLaborClassRow[] = calendar?.classes.filter((cls) => cls.active) ?? [];
  const resourcedPools =
    calendar?.pools.filter((pool) => state?.resources.some((r) => r.pool_id === pool.id)) ?? [];
  const canAdd =
    canEdit &&
    calendar !== null &&
    project.disposition === null &&
    (project.stage === "request" || project.stage === "estimate" || project.stage === "booked");
  const windows = resourcedPools.flatMap((pool) =>
    windowsFor(
      state?.resources.find((r) => r.pool_id === pool.id),
      parseWindows(pool.default_windows),
    ),
  );
  const uniqueWindows = windows.filter(
    (w, index) => windows.findIndex((o) => o.start === w.start && o.end === w.end) === index,
  );

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-bold text-ink-900">Dates</h3>
        <span className="text-xs text-ink-500">
          Planned now; held for 14 days when the estimate is sent; confirmed when it is approved.
        </span>
        <span className="flex-1" />
        <TextLink href={CALENDAR_PATH} className="text-xs">
          Calendar
        </TextLink>
      </div>

      {!calendar && (
        <Alert variant="note">
          No term plan is active, so dates can&apos;t be planned or checked. The Director of
          Operations activates one on the Calendar tab.
        </Alert>
      )}

      {planned.length > 0 && (
        <details className="text-sm" open={failing.length > 0}>
          <summary className="cursor-pointer">
            {failing.length === 0 ? (
              <span className="font-semibold text-success-fg">
                All {planned.length} planned date{planned.length === 1 ? " is" : "s are"} available
              </span>
            ) : (
              <span className="font-semibold text-[#8F3A3A]">
                {planned.length - failing.length} of {planned.length} planned dates available —{" "}
                {failing.length} would be refused
              </span>
            )}
            <span className="ml-2 text-xs font-bold text-brand-link">show the check</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs">
            {planned.map((check) => {
              const booking = dates.find((b) => b.id === check.bookingId)!;
              const result = check.result!;
              return (
                <li
                  key={check.bookingId}
                  className="flex flex-col gap-0.5 border-l-2 border-line pl-3"
                >
                  <span className="font-semibold text-ink-700">
                    {formatDateShort(booking.date, true)} ·{" "}
                    {formatWindow(booking.window_start, booking.window_end)} ·{" "}
                    {poolName(booking.pool_id)}
                  </span>
                  {result.ok ? (
                    <span className="text-success-fg">
                      Available{result.warnings.length > 0 ? ` — ${result.warnings.join(" ")}` : ""}
                    </span>
                  ) : (
                    <>
                      <span className="text-[#8F3A3A]">{result.refusal.message}</span>
                      <span className="text-ink-500">
                        {result.alternatives.length > 0
                          ? `Nearest open: ${result.alternatives
                              .map(
                                (a) =>
                                  `${formatDateShort(a.date, true)} ${a.label} (${formatWindow(a.window_start, a.window_end)})`,
                              )
                              .join("; ")}`
                          : "No open window nearby on this resource."}
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {warnings.length > 0 && failing.length === 0 && (
        <Alert variant="warning">{warnings.join(" ")}</Alert>
      )}

      {dates.length === 0 ? (
        <EmptyState compact>
          No dates yet.{" "}
          {project.requested === "airtime"
            ? "An airtime-only request needs none."
            : "Plan each window the work needs."}
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>When</Th>
                <Th>Pool</Th>
                <Th>Hours</Th>
                <Th>Status</Th>
                {canEdit && (
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </HeaderRow>
            </thead>
            <tbody>
              {dates.map((booking) => (
                <Row key={booking.id}>
                  <Cell stack="title">
                    {formatDateShort(booking.date, true)} ·{" "}
                    {formatWindow(booking.window_start, booking.window_end)}
                  </Cell>
                  <Cell label="Pool">{poolName(booking.pool_id)}</Cell>
                  <Cell label="Hours" className="text-xs text-ink-700">
                    {describeHours(booking.hours, classes)}
                  </Cell>
                  <Cell label="Status">
                    <Badge
                      variant={
                        booking.status === "confirmed"
                          ? "success"
                          : booking.status === "tentative"
                            ? "accent"
                            : "neutral"
                      }
                    >
                      {BOOKING_STATUS_LABEL[booking.status]}
                    </Badge>
                    {booking.exception_reason && (
                      <span className="block text-xs text-warning-fg">
                        Exception: {booking.exception_reason}
                      </span>
                    )}
                  </Cell>
                  {canEdit && (
                    <Cell stack="aside" className="text-right">
                      <form action={removeDate}>
                        <input type="hidden" name="project_id" value={project.id} />
                        <input type="hidden" name="booking_id" value={booking.id} />
                        <Button type="submit" variant="ghost">
                          {booking.status === "planned" ? "Remove" : "Release"}
                        </Button>
                      </form>
                    </Cell>
                  )}
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
      {released.length > 0 && (
        <p className="text-xs text-ink-500">
          {released.length} released date{released.length === 1 ? "" : "s"} kept as history.
        </p>
      )}

      {canAdd && calendar && state && openCard === "block" && attachableBlocks.length > 0 && (
        <InlineCreateCard
          title="Use a reserved block"
          action={attachReservedBlock}
          submitLabel="Take the block"
          cancelHref={here}
        >
          <input type="hidden" name="project_id" value={project.id} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rb_block">Reserved block</Label>
              <Select
                id="rb_block"
                name="block_id"
                defaultValue={attachableBlocks[0]?.id ?? ""}
                autoFocus
              >
                {attachableBlocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {formatDateShort(block.date, true)} ·{" "}
                    {formatWindow(toHHMM(block.window_start), toHHMM(block.window_end))} ·{" "}
                    {block.pool_name}
                    {block.state === "kept" ? ` (${BLOCK_STATE_LABEL.kept.toLowerCase()})` : ""}
                  </option>
                ))}
              </Select>
              <FieldHint>
                A window the agreement holds for this partner. It becomes a date on this request —
                planned, held or confirmed to match where the estimate stands.
              </FieldHint>
            </div>
          </div>
          <fieldset className="mt-4">
            <legend className="text-xs font-bold text-ink-700">Hours this date takes</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {classes.map((cls) => (
                <div key={cls.id}>
                  <Label htmlFor={`rb_hours_${cls.id}`}>{cls.name}</Label>
                  <Input
                    id={`rb_hours_${cls.id}`}
                    name={`hours_${cls.id}`}
                    type="number"
                    step="0.25"
                    min="0"
                    defaultValue={dates.length === 0 && draw[cls.id] ? String(draw[cls.id]) : ""}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </InlineCreateCard>
      )}

      {canAdd &&
        calendar &&
        state &&
        (openCard === "date" ? (
          <InlineCreateCard
            title="Plan a date"
            action={addPlannedDate}
            submitLabel="Add the date"
            cancelHref={here}
          >
            <input type="hidden" name="project_id" value={project.id} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="d_pool">Pool</Label>
                <Select id="d_pool" name="pool_id" defaultValue={resourcedPools[0]?.id ?? ""}>
                  {resourcedPools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="d_date">Date</Label>
                <Input
                  id="d_date"
                  name="date"
                  type="date"
                  required
                  defaultValue={project.event_starts_on ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="d_window">Window</Label>
                <Select
                  id="d_window"
                  name="window"
                  defaultValue={
                    uniqueWindows[0]
                      ? `${uniqueWindows[0].start}-${uniqueWindows[0].end}`
                      : "custom"
                  }
                >
                  {uniqueWindows.map((w) => (
                    <option key={`${w.start}-${w.end}`} value={`${w.start}-${w.end}`}>
                      {w.label} · {formatWindow(w.start, w.end)}
                    </option>
                  ))}
                  <option value="custom">Custom times below</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="d_start">Custom start</Label>
                <Input id="d_start" name="window_start" type="time" />
              </div>
              <div>
                <Label htmlFor="d_end">Custom end</Label>
                <Input id="d_end" name="window_end" type="time" />
              </div>
            </div>
            <fieldset className="mt-4">
              <legend className="text-xs font-bold text-ink-700">Hours this date takes</legend>
              <FieldHint>
                {dates.length === 0
                  ? "Prefilled with the estimate's whole draw; spread it across several dates by editing each."
                  : "Taken from each class's day and from its capacity for the pricing."}
              </FieldHint>
              <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {classes.map((cls) => (
                  <div key={cls.id}>
                    <Label htmlFor={`d_hours_${cls.id}`}>{cls.name}</Label>
                    <Input
                      id={`d_hours_${cls.id}`}
                      name={`hours_${cls.id}`}
                      type="number"
                      step="0.25"
                      min="0"
                      defaultValue={dates.length === 0 && draw[cls.id] ? String(draw[cls.id]) : ""}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="mt-4">
              <Label htmlFor="d_notes">Notes</Label>
              <Textarea id="d_notes" name="notes" rows={2} maxLength={500} />
            </div>
          </InlineCreateCard>
        ) : (
          <div className="flex flex-wrap gap-4">
            <TextLink href={requestHref(project.id, { new: "date" })}>+ Plan a date</TextLink>
            {attachableBlocks.length > 0 && openCard !== "block" && (
              <TextLink href={requestHref(project.id, { new: "block" })}>
                + Use a reserved block ({attachableBlocks.length})
              </TextLink>
            )}
          </div>
        ))}
    </Card>
  );
}

function describeHours(hours: HoursByClass, classes: BkLaborClassRow[]): string {
  const parts = Object.entries(hours)
    .filter(([, value]) => Number(value) > 0)
    .map(
      ([classId, value]) => `${classes.find((c) => c.id === classId)?.name ?? "Labor"} ${value} h`,
    );
  return parts.length > 0 ? parts.join(" · ") : "—";
}
