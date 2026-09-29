"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldHint, Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  describeDaysOfWeek,
  formatDateShort,
  formatDaysOfWeek,
  formatLengthLong,
  formatTimeRange,
  nextAiringDate,
} from "@/lib/log/program-status";
import { formatAirTime } from "@/lib/log/schedule";
import { effectiveDays, findScheduleOverlaps, type OverlapOther } from "@/lib/log/schedule-overlap";
import type { LogScheduleEntryType } from "@/lib/database.types";

/** Mon..Sun, as the mockup lays them out; values are 0 = Sunday like log_schedule.days_of_week. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LENGTH_CHIPS = [
  { minutes: 30, text: "30 min" },
  { minutes: 60, text: "1 h" },
  { minutes: 120, text: "2 h" },
  { minutes: 240, text: "4 h" },
];

export interface ScheduleEditorEntry {
  clock_template_id: string;
  entry_type: LogScheduleEntryType;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  air_time: string;
  duration_minutes: number;
  notes: string | null;
}

/**
 * The schedule editor shared by "+ Add a time" (new) and "Edit" / "Change
 * clock" (edit) so the two can't drift (docs/ui-patterns.md, rule 3). It is an
 * ordinary `<form action={serverAction}>`: the day buttons and quick
 * shortcuts are controlled state rendered into real hidden `days_of_week`
 * inputs, so the form submits what the preview shows. The preview's overlap
 * check is advisory — it never blocks a save.
 */
export function ScheduleEditor({
  action,
  programId,
  entryId,
  entry,
  templates,
  defaultClockId,
  others,
  todayISO,
  submitLabel = "Save schedule",
  cancelHref,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  programId: string;
  /** Present when editing; carried as a hidden field. */
  entryId?: string;
  entry?: ScheduleEditorEntry;
  templates: Array<{ id: string; name: string }>;
  /** Preselected clock for a new entry (`?clock=` on the new-entry page). */
  defaultClockId?: string;
  /** Every schedule entry, for the overlap check (the entry being edited is skipped by id). */
  others: OverlapOther[];
  /** Station "today" from the server — the client never reads the clock. */
  todayISO: string;
  submitLabel?: string;
  cancelHref: string;
  error?: string;
}) {
  const [days, setDays] = useState<number[]>(entry?.days_of_week ?? []);
  const [airTime, setAirTime] = useState(entry?.air_time.slice(0, 5) ?? "");
  const [duration, setDuration] = useState(entry ? String(entry.duration_minutes) : "");
  const [startDate, setStartDate] = useState(entry?.start_date ?? todayISO);
  const [endDate, setEndDate] = useState(entry?.end_date ?? "");
  const [clockId, setClockId] = useState(
    entry?.clock_template_id ?? defaultClockId ?? templates[0]?.id ?? "",
  );
  const [entryType, setEntryType] = useState<LogScheduleEntryType>(
    entry?.entry_type ?? "recurring",
  );
  const endRef = useRef<HTMLInputElement>(null);

  const toggleDay = (day: number) =>
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );

  const durationMinutes = Number(duration) || 0;
  const recurring = entryType === "recurring";
  const hasDays = !recurring || days.length > 0;
  const ready = hasDays && durationMinutes > 0 && airTime !== "";
  const airingDays = useMemo(
    () => effectiveDays({ entry_type: entryType, days_of_week: days }),
    [entryType, days],
  );

  const overlaps = useMemo(
    () =>
      ready
        ? findScheduleOverlaps(
            {
              id: entryId,
              entry_type: entryType,
              days_of_week: days,
              start_date: startDate,
              end_date: endDate || null,
              air_time: airTime,
              duration_minutes: durationMinutes,
            },
            others,
          )
        : [],
    [ready, entryId, entryType, days, startDate, endDate, airTime, durationMinutes, others],
  );

  const next = useMemo(() => {
    if (!ready) return null;
    const from = startDate > todayISO ? startDate : todayISO;
    const date = nextAiringDate(
      {
        entry_type: entryType,
        days_of_week: days,
        start_date: startDate,
        end_date: endDate || null,
      },
      from,
    );
    return date ? `${formatDateShort(date, true)} at ${formatAirTime(airTime)}` : null;
  }, [ready, startDate, todayISO, entryType, days, endDate, airTime]);

  const timeText = ready
    ? formatTimeRange(airTime, durationMinutes)
    : airTime && durationMinutes === 0
      ? formatAirTime(airTime)
      : "Set a time and length";
  const daysText = !hasDays
    ? "Pick at least one day"
    : `${recurring ? describeDaysOfWeek(days) : "Every day in its dates"}${
        durationMinutes > 0 ? ` · ${formatLengthLong(durationMinutes)}` : ""
      }`;

  const selectedClock = templates.find((template) => template.id === clockId);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <form action={action} className="flex w-full max-w-2xl min-w-0 flex-col gap-6 lg:flex-1">
        {error && <Alert>{error}</Alert>}
        <input type="hidden" name="program_id" value={programId} />
        {entryId && <input type="hidden" name="entry_id" value={entryId} />}
        {days.map((day) => (
          <input key={day} type="hidden" name="days_of_week" value={day} />
        ))}

        <fieldset className="min-w-0 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-bold text-ink-900">Days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAY_ORDER.map((day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-11 w-16 rounded border text-[15px] font-bold",
                    on
                      ? "border-brand-primary bg-brand-primary text-white"
                      : "border-line bg-white text-ink-700 hover:bg-panel-50",
                  )}
                >
                  {DAY_SHORT[day]}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setDays([1, 2, 3, 4, 5])}
              className="text-brand-link hover:underline"
            >
              Weekdays
            </button>
            <button
              type="button"
              onClick={() => setDays([6, 0])}
              className="text-brand-link hover:underline"
            >
              Weekend
            </button>
            <button
              type="button"
              onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
              className="text-brand-link hover:underline"
            >
              Every day
            </button>
          </div>
          {!recurring && <FieldHint>Days are only used for a recurring entry.</FieldHint>}
        </fieldset>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="w-40">
            <Label htmlFor="air_time">Starts at</Label>
            <Input
              id="air_time"
              name="air_time"
              type="time"
              required
              value={airTime}
              onChange={(event) => setAirTime(event.target.value)}
            />
          </div>
          <div className="w-36">
            <Label htmlFor="duration_minutes">Length (minutes)</Label>
            <Input
              id="duration_minutes"
              name="duration_minutes"
              type="number"
              required
              min={1}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </div>
          <div className="flex gap-1.5 pb-1.5">
            {LENGTH_CHIPS.map((chip) => (
              <button
                key={chip.minutes}
                type="button"
                aria-pressed={durationMinutes === chip.minutes}
                onClick={() => setDuration(String(chip.minutes))}
                className={cn(
                  "h-9 rounded-full border px-3 text-[13px] font-semibold",
                  durationMinutes === chip.minutes
                    ? "border-brand-primary bg-brand-surface text-brand-link"
                    : "border-line bg-white text-ink-900 hover:bg-panel-50",
                )}
              >
                {chip.text}
              </button>
            ))}
          </div>
        </div>
        <FieldHint>May span multiple hours — the clock repeats each hour.</FieldHint>

        <div className="flex flex-wrap gap-5">
          <div className="w-full sm:w-52">
            <Label htmlFor="start_date">Starting</Label>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="w-full sm:w-52">
            <Label htmlFor="end_date">Ending (optional)</Label>
            <input
              id="end_date"
              name="end_date"
              type="date"
              ref={endRef}
              className={controlClasses}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="clock_template_id">Clock</Label>
            <Select
              id="clock_template_id"
              name="clock_template_id"
              required
              value={clockId}
              onChange={(event) => setClockId(event.target.value)}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
            <FieldHint>
              {entry ? (
                <>
                  Rundowns already generated keep the clock they were built from; the new clock
                  applies to rundowns generated from now on.{" "}
                </>
              ) : (
                <>
                  Not listed?{" "}
                  <Link
                    href={`/log/clocks/new?from=${programId}`}
                    className="font-semibold text-brand-link hover:underline"
                  >
                    Create a clock for this program
                  </Link>
                  .{" "}
                </>
              )}
              {selectedClock && (
                <Link
                  href={`/log/clocks/${selectedClock.id}?from=${programId}`}
                  className="font-semibold text-brand-link hover:underline"
                >
                  Open this clock
                </Link>
              )}
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="entry_type">Entry type</Label>
            <Select
              id="entry_type"
              name="entry_type"
              value={entryType}
              onChange={(event) => setEntryType(event.target.value as LogScheduleEntryType)}
            >
              <option value="recurring">Recurring</option>
              <option value="override">Override</option>
              <option value="holiday">Holiday</option>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" maxLength={240} defaultValue={entry?.notes ?? undefined} />
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
          <Button type="submit">{submitLabel}</Button>
          <Link
            href={cancelHref}
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            Cancel
          </Link>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              endRef.current?.scrollIntoView({ block: "center" });
              endRef.current?.focus();
            }}
            className="text-sm font-semibold text-ink-500 hover:text-ink-700 hover:underline"
          >
            Stop airing from a date…
          </button>
        </div>
      </form>

      <aside
        aria-label="Preview"
        aria-live="polite"
        className="w-full shrink-0 rounded border border-line bg-panel-50 lg:w-[26rem]"
      >
        <div className="border-b border-line px-5 py-3.5">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-500">Preview</div>
          <div className="mt-1 text-[22px] font-bold tabular-nums text-ink-900">{timeText}</div>
          <div className="text-[15px] text-ink-700">{daysText}</div>
        </div>
        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_ORDER.map((day) => {
              const on = ready && airingDays.includes(day);
              return (
                <div
                  key={day}
                  className={cn(
                    "rounded border px-1 py-2 text-center",
                    on ? "border-brand-primary/40 bg-brand-surface" : "border-line bg-white",
                  )}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
                    {DAY_SHORT[day]}
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-xs font-bold",
                      on ? "text-brand-link" : "text-ink-400",
                    )}
                  >
                    {on ? formatAirTime(airTime).replace(":00", "") : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-sm text-ink-700">
            Next airing: <b>{next ?? "—"}</b>
          </div>
          {ready && overlaps.length === 0 && (
            <div className="rounded border border-success-fg/30 bg-success-bg px-3 py-2.5 text-sm text-success-fg">
              No overlap with another program on these days.
            </div>
          )}
          {ready && overlaps.length > 0 && (
            <div className="rounded border border-warning-fg/30 bg-warning-bg px-3 py-2.5 text-sm text-warning-fg">
              <p className="font-semibold">
                This overlaps{" "}
                {overlaps.length === 1 ? "another entry" : `${overlaps.length} other entries`}. You
                can still save.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {overlaps.map((overlap) => (
                  <li key={overlap.entryId}>
                    {overlap.programName} · {formatDaysOfWeek(overlap.days)} ·{" "}
                    {formatTimeRange(overlap.airTime, overlap.durationMinutes)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!ready && (
            <div className="rounded border border-warning-fg/30 bg-warning-bg px-3 py-2.5 text-sm text-warning-fg">
              A schedule needs {recurring ? "at least one day, " : ""}a start time and a length
              above zero.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
