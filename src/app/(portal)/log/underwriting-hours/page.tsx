import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/ui/day-picker";
import { FilterChips } from "@/components/ui/filter-chips";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Input, Label } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Segmented } from "@/components/ui/segmented";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import {
  automatedLayer,
  HoursCalendar,
  underwritingLayer,
  type CalendarView,
} from "@/components/log/hours-calendar";
import { requireLogAccess } from "@/lib/log/access";
import {
  formatChangeWhen,
  formatWindowHours,
  localFormValues,
  programsInWindow,
} from "@/lib/log/automated-hours-display";
import { loadAutomatedHours } from "@/lib/log/automated-hours-queries";
import {
  countUnderwritingHourChanges,
  listClosedWindows,
  listUnderwritingHourChanges,
  loadUnderwritingHours,
  toClosedWindow,
  UNDERWRITING_HOUR_CHANGES_PAGE_SIZE,
  type LogUnderwritingClosedWeeklyRow,
  type LogUnderwritingHourChangeRow,
} from "@/lib/log/underwriting-hours-queries";
import { formatDateShort, formatDaysOfWeek } from "@/lib/log/program-status";
import { listScheduleEntries, type ScheduleEntryWithNames } from "@/lib/log/queries";
import { shiftDateISO, stationTodayISO } from "@/lib/log/timezone";
import { isValidDateISO } from "@/lib/log/week-layout";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import { ScheduleTabs } from "../schedule-tabs";
import {
  createClosedWindow,
  createUnderwritingHourChange,
  removeClosedWindow,
  removeUnderwritingHourChange,
  updateClosedWindow,
  updateUnderwritingHourChange,
} from "./actions";

const BASE_PATH = "/log/underwriting-hours";

/**
 * Underwriting hours (lib/log/underwriting-hours.ts): auto-fill may schedule
 * an underwriting credit in any hour unless it's closed here; a staffer's
 * manual placement and a host's relocation are never refused by it. The
 * week or month picture (components/log/hours-calendar.tsx, shared with the
 * Automation page, which supplies the faint context layer here) and then
 * the two kinds of record behind it — weekly closed windows and one-time
 * changes. The program director adds and edits inline (`?new=weekly`,
 * `?new=once`, `?edit=<id>`); everyone else reads.
 */
export default async function UnderwritingHoursPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    date?: string;
    new?: string;
    edit?: string;
    error?: string;
    changes?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const { isProgramDirector } = await requireLogAccess();
  const view: CalendarView = params.view === "month" ? "month" : "week";
  const today = stationTodayISO();
  const date = isValidDateISO(params.date) ? params.date : today;
  const scope = params.changes === "past" ? "past" : "upcoming";
  const page = parsePage(params.page);
  const nowISO = new Date().toISOString();

  const [hours, automatedHours, weeklyRows, changePage, changeCounts, scheduleEntries] =
    await Promise.all([
      loadUnderwritingHours(),
      loadAutomatedHours(),
      listClosedWindows(),
      listUnderwritingHourChanges(scope, page, nowISO),
      countUnderwritingHourChanges(nowISO),
      listScheduleEntries(),
    ]);

  const info = pageInfo(page, changePage.total, UNDERWRITING_HOUR_CHANGES_PAGE_SIZE);
  const listParams = {
    view: view === "month" ? "month" : null,
    date: params.date ?? null,
    changes: scope === "past" ? "past" : null,
  };
  if (isPastLastPage(info)) redirect(pageHref(BASE_PATH, listParams, info.pageCount));

  const keep = { view: listParams.view, date: listParams.date };
  const href = (extra: Record<string, string | null>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...keep, ...extra })) {
      if (value) query.set(key, value);
    }
    const text = query.toString();
    return text ? `${BASE_PATH}?${text}` : BASE_PATH;
  };
  const closeHref = href({ changes: listParams.changes, page: page > 1 ? String(page) : null });
  const creating = isProgramDirector ? params.new : undefined;
  const editing = isProgramDirector ? params.edit : undefined;
  const error = params.error;
  const editingWeekly = weeklyRows.find((row) => row.id === editing) ?? null;
  const editingChange = changePage.rows.find((row) => row.id === editing) ?? null;
  const cardOpen = creating === "weekly" || creating === "once" || editingWeekly || editingChange;

  const hidden = (
    <>
      {view === "month" && <input type="hidden" name="view" value="month" />}
      {params.date && <input type="hidden" name="date" value={params.date} />}
    </>
  );

  return (
    <>
      <ScheduleTabs active="underwriting" />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-ink-900">Underwriting hours</h1>
          <p className="max-w-3xl text-sm text-ink-500">
            Auto-fill may schedule an underwriting credit in any hour unless it&apos;s closed here.
            Traffic staff can still place one by hand, and hosts can still move one.
          </p>
        </div>

        {error && !cardOpen && <Alert>{error}</Alert>}

        <HoursCalendar
          view={view}
          date={date}
          today={today}
          entries={scheduleEntries}
          primary={underwritingLayer(hours)}
          context={automatedLayer(automatedHours)}
          weekHref={(iso) => href({ view: null, date: iso })}
          monthHref={(iso) => href({ view: "month", date: iso })}
        />

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-ink-900">Closed every week</h2>
            <span className="flex-1" />
            {isProgramDirector && !cardOpen && (
              <PrimaryLink href={href({ new: "weekly" })}>+ Weekly hours</PrimaryLink>
            )}
          </div>
          {(creating === "weekly" || editingWeekly) && (
            <WeeklyCard
              row={editingWeekly}
              today={today}
              error={error}
              cancelHref={closeHref}
              hidden={hidden}
            />
          )}
          <WeeklyTable
            rows={weeklyRows}
            entries={scheduleEntries}
            today={today}
            editHref={isProgramDirector ? (id) => href({ edit: id }) : null}
          />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-bold text-ink-900">One-time changes</h2>
            <FilterChips
              label="When"
              chips={[
                {
                  label: "Upcoming",
                  href: href({ changes: null }),
                  active: scope === "upcoming",
                  count: changeCounts.upcoming,
                },
                {
                  label: "Past",
                  href: href({ changes: "past" }),
                  active: scope === "past",
                  count: changeCounts.past,
                },
              ]}
            />
            <span className="flex-1" />
            {isProgramDirector && !cardOpen && (
              <PrimaryLink href={href({ new: "once", changes: listParams.changes })}>
                + One-time change
              </PrimaryLink>
            )}
          </div>
          {(creating === "once" || editingChange) && (
            <ChangeCard
              row={editingChange}
              date={date}
              error={error}
              cancelHref={closeHref}
              hidden={hidden}
            />
          )}
          <ChangesTable
            rows={changePage.rows}
            scope={scope}
            editHref={
              isProgramDirector
                ? (id) =>
                    href({
                      edit: id,
                      changes: listParams.changes,
                      page: page > 1 ? String(page) : null,
                    })
                : null
            }
          />
          <Pagination info={info} path={BASE_PATH} params={listParams} noun="changes" />
          <p className="text-[13px] text-ink-500">
            A one-time change wins over the weekly hours. One-time changes can&apos;t overlap each
            other. Times are Central. Nothing already placed is moved when the hours change.
          </p>
        </section>
      </div>
    </>
  );
}

function formatSince(row: LogUnderwritingClosedWeeklyRow): string {
  return row.effective_to
    ? `${formatDateShort(row.effective_from)} – ${formatDateShort(row.effective_to)}`
    : formatDateShort(row.effective_from);
}

function WeeklyTable({
  rows,
  entries,
  today,
  editHref,
}: {
  rows: LogUnderwritingClosedWeeklyRow[];
  entries: ScheduleEntryWithNames[];
  today: string;
  editHref: ((id: string) => string) | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No hours are closed. Auto-fill may schedule a credit in any hour that has an eligible break.
      </div>
    );
  }
  return (
    <TableFrame>
      <Table stack>
        <thead>
          <HeaderRow>
            <Th>Days</Th>
            <Th>Hours</Th>
            <Th>Programs in these hours</Th>
            <Th>Since</Th>
            {editHref && (
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            )}
          </HeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => {
            const programs = programsInWindow(toClosedWindow(row), entries, today);
            return (
              <Row key={row.id}>
                <Cell stack="title">
                  {formatDaysOfWeek(row.days_of_week)}
                  {row.reason && (
                    <span className="block text-xs font-normal text-ink-500">{row.reason}</span>
                  )}
                </Cell>
                <Cell label="Hours" className="whitespace-nowrap">
                  {formatWindowHours(row.start_time, row.end_time)}
                </Cell>
                <Cell label="Programs">{programs.length > 0 ? programs.join(", ") : "—"}</Cell>
                <Cell label="Since" className="whitespace-nowrap">
                  {formatSince(row)}
                </Cell>
                {editHref && (
                  <Cell stack="aside">
                    <Link
                      href={editHref(row.id)}
                      className="text-sm font-semibold text-brand-link hover:underline"
                    >
                      Edit
                    </Link>
                  </Cell>
                )}
              </Row>
            );
          })}
        </tbody>
      </Table>
    </TableFrame>
  );
}

function ChangesTable({
  rows,
  scope,
  editHref,
}: {
  rows: LogUnderwritingHourChangeRow[];
  scope: "upcoming" | "past";
  editHref: ((id: string) => string) | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        {scope === "upcoming" ? "No one-time changes coming up." : "No past one-time changes."}
      </div>
    );
  }
  return (
    <TableFrame>
      <Table stack>
        <thead>
          <HeaderRow>
            <Th>When</Th>
            <Th>Change</Th>
            <Th>Reason</Th>
            {editHref && (
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            )}
          </HeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.id}>
              <Cell stack="title">{formatChangeWhen(row.starts_at, row.ends_at)}</Cell>
              <Cell label="Change">
                <Badge variant={row.mode === "closed" ? "warning" : "success"}>
                  {row.mode === "closed" ? "Closed" : "Open"}
                </Badge>
              </Cell>
              <Cell label="Reason">{row.reason ?? "—"}</Cell>
              {editHref && (
                <Cell stack="aside">
                  <Link
                    href={editHref(row.id)}
                    className="text-sm font-semibold text-brand-link hover:underline"
                  >
                    Edit
                  </Link>
                </Cell>
              )}
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}

function WeeklyCard({
  row,
  today,
  error,
  cancelHref,
  hidden,
}: {
  row: LogUnderwritingClosedWeeklyRow | null;
  today: string;
  error: string | undefined;
  cancelHref: string;
  hidden: ReactNode;
}) {
  return (
    <InlineCreateCard
      title={row ? "Edit closed hours" : "New weekly closed hours"}
      action={row ? updateClosedWindow : createClosedWindow}
      submitLabel={row ? "Save" : "Add hours"}
      cancelHref={cancelHref}
      sections={
        row ? (
          <div className="border-t border-line px-5 py-3">
            <Button type="submit" variant="ghost" formAction={removeClosedWindow} formNoValidate>
              Remove these hours
            </Button>
          </div>
        ) : undefined
      }
    >
      {hidden}
      {row && <input type="hidden" name="id" value={row.id} />}
      {error && <Alert className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">Days</span>
          <DayPicker name="day" defaultValue={row?.days_of_week ?? [0, 1, 2, 3, 4, 5, 6]} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
          <div>
            <Label htmlFor="start_time">From</Label>
            <Input
              id="start_time"
              name="start_time"
              type="time"
              required
              defaultValue={row?.start_time.slice(0, 5) ?? "05:00"}
            />
          </div>
          <div>
            <Label htmlFor="end_time">Until</Label>
            <Input
              id="end_time"
              name="end_time"
              type="time"
              required
              defaultValue={row?.end_time.slice(0, 5) ?? "17:00"}
            />
          </div>
        </div>
        <p className="-mt-2 text-[13px] text-ink-500">
          An end at or before the start runs past midnight into the next morning.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
          <div>
            <Label htmlFor="effective_from">Starting</Label>
            <Input
              id="effective_from"
              name="effective_from"
              type="date"
              required
              defaultValue={row?.effective_from ?? today}
            />
          </div>
          <div>
            <Label htmlFor="effective_to">Ending (optional)</Label>
            <Input
              id="effective_to"
              name="effective_to"
              type="date"
              defaultValue={row?.effective_to ?? ""}
            />
          </div>
        </div>
        <div className="sm:max-w-md">
          <Label htmlFor="reason">Note (optional)</Label>
          <Input
            id="reason"
            name="reason"
            maxLength={200}
            placeholder="Daytime"
            defaultValue={row?.reason ?? ""}
          />
        </div>
      </div>
    </InlineCreateCard>
  );
}

function ChangeCard({
  row,
  date,
  error,
  cancelHref,
  hidden,
}: {
  row: LogUnderwritingHourChangeRow | null;
  date: string;
  error: string | undefined;
  cancelHref: string;
  hidden: ReactNode;
}) {
  const from = row ? localFormValues(row.starts_at) : { date, time: "00:00" };
  const until = row ? localFormValues(row.ends_at) : { date: shiftDateISO(date, 1), time: "00:00" };
  return (
    <InlineCreateCard
      title={row ? "Edit one-time change" : "New one-time change"}
      action={row ? updateUnderwritingHourChange : createUnderwritingHourChange}
      submitLabel={row ? "Save" : "Add change"}
      cancelHref={cancelHref}
      sections={
        row ? (
          <div className="border-t border-line px-5 py-3">
            <Button
              type="submit"
              variant="ghost"
              formAction={removeUnderwritingHourChange}
              formNoValidate
            >
              Remove this change
            </Button>
          </div>
        ) : undefined
      }
    >
      {hidden}
      {row && <input type="hidden" name="id" value={row.id} />}
      {error && <Alert className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">These hours are</span>
          <Segmented
            name="mode"
            defaultValue={row?.mode ?? "closed"}
            options={[
              { value: "closed", label: "Closed" },
              { value: "open", label: "Open" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <div>
            <Label htmlFor="from_date">From</Label>
            <Input id="from_date" name="from_date" type="date" required defaultValue={from.date} />
          </div>
          <div>
            <Label htmlFor="from_time">Time</Label>
            <Input id="from_time" name="from_time" type="time" required defaultValue={from.time} />
          </div>
          <div>
            <Label htmlFor="until_date">Until</Label>
            <Input
              id="until_date"
              name="until_date"
              type="date"
              required
              defaultValue={until.date}
            />
          </div>
          <div>
            <Label htmlFor="until_time">Time</Label>
            <Input
              id="until_time"
              name="until_time"
              type="time"
              required
              defaultValue={until.time}
            />
          </div>
        </div>
        <p className="-mt-2 text-[13px] text-ink-500">
          Midnight to midnight covers whole days. The change ends at the &ldquo;Until&rdquo; time.
        </p>
        <div className="sm:max-w-md">
          <Label htmlFor="reason">Reason (optional)</Label>
          <Input
            id="reason"
            name="reason"
            maxLength={200}
            placeholder="Pledge drive"
            defaultValue={row?.reason ?? ""}
          />
        </div>
      </div>
    </InlineCreateCard>
  );
}
