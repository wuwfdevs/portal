"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { DayPicker } from "@/components/ui/day-picker";
import { FieldHint, Input, Label, Select, Textarea, controlClasses } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import type { UwScheduleEntryKind, UwServiceLevel, UwTimeMode } from "@/lib/database.types";
import { addDays, isValidDateISO, shortDate, weekStartOf } from "@/lib/underwriting/dates";
import { describeEntrySpec, totalQuantity } from "@/lib/underwriting/demand-compiler";
import {
  compileScheduleLineDemand,
  parseScheduleLineForm,
  type ScheduleLineFormValues,
} from "@/lib/underwriting/schedule-line-form";

/**
 * The order-entry form for one schedule line (docs/underwriting-traffic-
 * redesign.md §9, redesigned 2026-09-25 from the reviewed mockups). Only
 * the fields the chosen kind needs are rendered, so a value typed under
 * the wrong kind can't be posted; a week grid is laid out as one cell per
 * Monday between the line's dates (click a date to mark it with the
 * quantity, or type a count), explicit dates are rows, and the line is
 * compiled live with the same parseScheduleLineForm() the Server Action
 * runs, so what the aside shows is exactly what saving will store. Posts
 * as an ordinary <form action> with structured fields
 * (week_quantity:<monday>, explicit_date/explicit_quantity rows).
 *
 * Edit (2026-09-27) is the same component prefilled from a stored line
 * (`initial`, built by formValuesFromScheduleLine()) posting to
 * updateScheduleLine with `lineId` — docs/ui-patterns.md rule 3. Only a
 * line nothing has scheduled from reaches it; see line-mutability.ts.
 */

export interface EditorOption {
  id: string;
  name: string;
  hint?: string;
  /** Pools only: the programs the pool's targets cover; null when unrestricted (programsPermittedByPool). */
  programIds?: string[] | null;
}

export interface EditorLineSummary {
  label: string;
  expected: number;
}

const KIND_OPTIONS: { value: UwScheduleEntryKind; title: string; description: string }[] = [
  {
    value: "fixed_days",
    title: "Fixed days",
    description: "N credits on each named day — “Mon & Wed, 7:49 AM”.",
  },
  {
    value: "weekly_quota",
    title: "Weekly quota",
    description: "N credits a week, any eligible day.",
  },
  { value: "monthly_quota", title: "Monthly quota", description: "N credits a calendar month." },
  {
    value: "every_n_weeks",
    title: "Every N weeks",
    description: "N credits in one week out of every N.",
  },
  {
    value: "explicit_dates",
    title: "Explicit dates",
    description: "A list of dates, each with a count.",
  },
  {
    value: "week_grid",
    title: "Week grid",
    description: "A quantity per week, the way an agency grid prints it.",
  },
  { value: "range_total", title: "Range total", description: "N credits over the whole run." },
];

const TIME_OPTIONS: { value: UwTimeMode; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "window", label: "Window" },
  { value: "preferred", label: "Preferred" },
  { value: "exact", label: "Exact" },
  { value: "opening", label: "Opening" },
  { value: "closing", label: "Closing" },
];

const TIME_HINT: Record<UwTimeMode, string> = {
  any: "Any marked avail the pool or program allows.",
  window: "Only inside the window — a hard limit, end exclusive.",
  preferred: "Ranks the closest avail first; never excludes one.",
  exact: "The avail must start within 3 minutes of the time the order states.",
  opening: "The program's first underwriting avail of the day — name the program.",
  closing: "The program's last underwriting avail of the day — name the program.",
};

const DURATION_OPTIONS = [10, 15, 20, 30, 60];
const MAX_WEEKS = 260;

interface Week {
  weekStart: string;
  partial: boolean;
}

function weeksBetween(start: string, end: string): Week[] {
  if (!isValidDateISO(start) || !isValidDateISO(end) || end < start) return [];
  const weeks: Week[] = [];
  const last = weekStartOf(end);
  for (let m = weekStartOf(start); m <= last && weeks.length < MAX_WEEKS; m = addDays(m, 7)) {
    weeks.push({ weekStart: m, partial: m < start || addDays(m, 6) > end });
  }
  return weeks;
}

function toCount(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function ScheduleLineEditor({
  contractId,
  revisions,
  defaultRevisionId,
  pools,
  programs,
  flights,
  contractStart,
  contractEnd,
  otherLines,
  statedTotalSpots,
  action,
  returnTo,
  error,
  continueHref,
  initial,
  lineId,
  cancelHref,
}: {
  contractId: string;
  revisions: { id: string; label: string; status: string }[];
  defaultRevisionId: string;
  pools: EditorOption[];
  programs: EditorOption[];
  flights: EditorOption[];
  contractStart: string;
  contractEnd: string | null;
  /** The other lines already entered under the revision, for the contract total. */
  otherLines: EditorLineSummary[];
  statedTotalSpots: number | null;
  action: (formData: FormData) => Promise<void>;
  /** Where the action returns to after saving; the contract page by default. */
  returnTo?: string;
  error?: string | null;
  /** Shown as the form's last button when set (the wizard's "Continue"). */
  continueHref?: { href: string; label: string };
  /** Editing: the stored line's values, from formValuesFromScheduleLine(). */
  initial?: ScheduleLineFormValues;
  /** Editing: the line being rewritten; posted as schedule_line_id. */
  lineId?: string;
  /** Editing: where "Cancel" goes. */
  cancelHref?: string;
}) {
  const editing = lineId !== undefined;
  const initialDuration = initial?.duration_seconds ?? "";
  const initialDurationListed = DURATION_OPTIONS.includes(Number.parseInt(initialDuration, 10));
  const [kind, setKind] = useState<UwScheduleEntryKind>(
    (initial?.entry_kind as UwScheduleEntryKind | undefined) ?? "fixed_days",
  );
  const [label, setLabel] = useState(initial?.label ?? "");
  const [labelEdited, setLabelEdited] = useState((initial?.label ?? "") !== "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? contractStart);
  const [endDate, setEndDate] = useState(initial?.end_date ?? contractEnd ?? "");
  const [days, setDays] = useState<number[]>(initial?.days_of_week ?? []);
  const [countPerDay, setCountPerDay] = useState(initial?.count_per_day || "1");
  const [quantity, setQuantity] = useState(initial?.quantity ?? "");
  const [intervalWeeks, setIntervalWeeks] = useState(initial?.interval_weeks || "2");
  const [poolId, setPoolId] = useState(initial?.pool_id ?? "");
  const [programId, setProgramId] = useState(initial?.program_id ?? "");
  const [timeMode, setTimeMode] = useState<UwTimeMode>(
    (initial?.time_mode as UwTimeMode | undefined) ?? "any",
  );
  const [windowStart, setWindowStart] = useState(initial?.window_start ?? "");
  const [windowEnd, setWindowEnd] = useState(initial?.window_end ?? "");
  const [preferredTime, setPreferredTime] = useState(initial?.preferred_time ?? "");
  const [maxPerDay, setMaxPerDay] = useState(initial?.max_per_day ?? "");
  const [serviceLevel, setServiceLevel] = useState<UwServiceLevel>(
    (initial?.service_level as UwServiceLevel | undefined) ?? "guaranteed",
  );
  const [duration, setDuration] = useState(
    initial ? (initialDurationListed ? initialDuration : "other") : "30",
  );
  const [customDuration, setCustomDuration] = useState(
    initial && !initialDurationListed ? initialDuration : "",
  );
  const [statedTotal, setStatedTotal] = useState(initial?.stated_total ?? "");
  const [explicitRows, setExplicitRows] = useState<{ date: string; quantity: string }[]>(
    initial && initial.explicit_dates.length > 0
      ? initial.explicit_dates
      : [{ date: "", quantity: "" }],
  );
  const [weekQty, setWeekQty] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.week_grid ?? []).map((week) => [week.week_start, week.quantity])),
  );
  const [fill, setFill] = useState("1");

  const weeks = useMemo(
    () => (kind === "week_grid" ? weeksBetween(startDate, endDate) : []),
    [kind, startDate, endDate],
  );
  const fillN = toCount(fill);
  const durationValue = duration === "other" ? customDuration : duration;

  const values: ScheduleLineFormValues = {
    label,
    entry_kind: kind,
    days_of_week: days,
    count_per_day: kind === "fixed_days" ? countPerDay : "",
    quantity:
      kind === "weekly_quota" ||
      kind === "monthly_quota" ||
      kind === "every_n_weeks" ||
      kind === "range_total"
        ? quantity
        : "",
    interval_weeks: kind === "every_n_weeks" ? intervalWeeks : "",
    pool_id: poolId,
    program_id: programId,
    time_mode: timeMode,
    window_start: windowStart,
    window_end: windowEnd,
    preferred_time: preferredTime,
    max_per_day: maxPerDay,
    service_level: serviceLevel,
    duration_seconds: durationValue,
    start_date: startDate,
    end_date: endDate,
    flight_id: "",
    stated_total: statedTotal,
    source_text: "",
    makegood_policy_text: "",
    notes: "",
    explicit_dates: kind === "explicit_dates" ? explicitRows : [],
    week_grid:
      kind === "week_grid"
        ? weeks
            .map((week) => ({ weekStart: week.weekStart, quantity: weekQty[week.weekStart] ?? "" }))
            .map((row) => ({ week_start: row.weekStart, quantity: row.quantity }))
        : [],
  };
  // Compiled on every render with the same pure parser the Server Action
  // runs, so the aside shows exactly what saving will store. The count comes
  // from the demand stage alone (kind, dates, days, quantities) so it moves
  // as those are typed; whatever else the row still needs — a pool or
  // program, a time rule's fields — is listed beneath it rather than
  // blanking the number.
  const demand = compileScheduleLineDemand(values);
  const parsed = parseScheduleLineForm(values);
  const blockers = !parsed.ok && demand.ok ? parsed.errors : [];

  const compiledTotal = demand.ok ? totalQuantity(demand.value.buckets) : 0;
  const compiledDescription = demand.ok
    ? describeEntrySpec(demand.value.entry_spec, demand.value.days_of_week)
    : null;
  const partialCount = demand.ok ? demand.value.buckets.filter((b) => b.partial).length : 0;
  const statedN = Number.parseInt(statedTotal, 10);
  const lineMatches = Number.isFinite(statedN) && demand.ok && statedN === compiledTotal;
  const lineOff = Number.isFinite(statedN) && demand.ok && statedN !== compiledTotal;

  const otherTotal = otherLines.reduce((sum, line) => sum + line.expected, 0);
  const contractTotal = otherTotal + compiledTotal;

  const selectedPool = pools.find((pool) => pool.id === poolId);
  const poolName = selectedPool?.name;
  const programName = programs.find((program) => program.id === programId)?.name;
  // A line naming both is the intersection, so only offer the programs the
  // chosen pool can place into; picking a pool that excludes the current
  // program clears it (see the pool select's onChange).
  const permittedProgramIds = selectedPool?.programIds ?? null;
  const offeredPrograms =
    permittedProgramIds === null
      ? programs
      : programs.filter((program) => permittedProgramIds.includes(program.id));
  const suggestedLabel =
    demand.ok && (poolName || programName)
      ? `${poolName ?? programName}, ${describeEntrySpec(demand.value.entry_spec, demand.value.days_of_week).split(",")[0]}`
      : "";
  const effectiveLabel = labelEdited ? label : suggestedLabel;

  // Week grid ---------------------------------------------------------------
  const gridStats = (() => {
    let withCredits = 0;
    let total = 0;
    for (const week of weeks) {
      const n = toCount(weekQty[week.weekStart] ?? "");
      if (n > 0) withCredits += 1;
      total += n;
    }
    return { withCredits, dark: weeks.length - withCredits, total };
  })();
  const setAllWeeks = (pick: (index: number) => boolean) => {
    if (fillN <= 0) return;
    const next = { ...weekQty };
    weeks.forEach((week, index) => {
      next[week.weekStart] = pick(index) ? String(fillN) : "0";
    });
    setWeekQty(next);
  };
  const toggleWeek = (weekStart: string) => {
    const current = toCount(weekQty[weekStart] ?? "");
    setWeekQty({ ...weekQty, [weekStart]: current > 0 ? "0" : String(fillN) });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <form
        action={action}
        className="flex min-w-0 flex-1 flex-col gap-6 rounded border border-line p-5 sm:p-6"
      >
        <input type="hidden" name="contract_id" value={contractId} />
        {lineId && <input type="hidden" name="schedule_line_id" value={lineId} />}
        {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
        <div>
          <h3 className="font-serif text-lg font-bold text-ink-900">
            {editing ? "Edit this line" : "Add a line from the order"}
          </h3>
          <p className="mt-1 text-[13px] text-ink-500">
            {editing
              ? "Nothing has scheduled from this line yet, so it can be corrected in place. Its demand is recompiled when you save."
              : "One line per instruction the order prints. Only the fields that instruction needs appear."}
          </p>
        </div>
        {error && <Alert>{error}</Alert>}

        {!editing && revisions.length > 1 && (
          <div>
            <Label htmlFor="line_revision">Revision</Label>
            <Select id="line_revision" name="revision_id" defaultValue={defaultRevisionId}>
              {revisions.map((revision) => (
                <option key={revision.id} value={revision.id}>
                  {revision.label} ({revision.status})
                </option>
              ))}
            </Select>
          </div>
        )}
        {!editing && revisions.length === 1 && (
          <input type="hidden" name="revision_id" value={revisions[0]!.id} />
        )}

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1.5 text-xs font-semibold text-ink-700">
            How does the order sell it?
          </legend>
          <ChoiceCards name="entry_kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
        </fieldset>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor="start_date">Line starts</Label>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="end_date">Line ends</Label>
            <Input
              id="end_date"
              name="end_date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="duration_select">Credit length</Label>
            <Select
              id="duration_select"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              {DURATION_OPTIONS.map((seconds) => (
                <option key={seconds} value={String(seconds)}>
                  {seconds} seconds
                </option>
              ))}
              <option value="other">Other…</option>
            </Select>
            {duration === "other" ? (
              <Input
                className="mt-1.5"
                name="duration_seconds"
                type="number"
                min={1}
                placeholder="Seconds"
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                aria-label="Credit length in seconds"
              />
            ) : (
              <input type="hidden" name="duration_seconds" value={duration} />
            )}
          </div>
          <div>
            <Label htmlFor="stated_total">Spots on the order</Label>
            <Input
              id="stated_total"
              name="stated_total"
              inputMode="numeric"
              value={statedTotal}
              onChange={(e) => setStatedTotal(e.target.value)}
              placeholder="As printed"
            />
            <FieldHint>
              The count the order prints for this line, if it prints one. Checked against what the
              line compiles to; a mismatch warns but never blocks saving.
            </FieldHint>
          </div>
        </div>

        {kind === "fixed_days" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div>
              <Label htmlFor="count_per_day">Credits on each day</Label>
              <Input
                id="count_per_day"
                name="count_per_day"
                type="number"
                min={1}
                value={countPerDay}
                onChange={(e) => setCountPerDay(e.target.value)}
              />
            </div>
            <div>
              <Label>The days it airs</Label>
              <DayPicker
                name="days_of_week"
                value={days}
                onToggle={(day) =>
                  setDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day])
                }
              />
              <FieldHint>
                A fixed-days line airs on exactly these days, every week between its dates.
              </FieldHint>
            </div>
          </div>
        )}

        {(kind === "weekly_quota" || kind === "monthly_quota" || kind === "range_total") && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div>
              <Label htmlFor="quantity">
                {kind === "weekly_quota"
                  ? "Credits a week"
                  : kind === "monthly_quota"
                    ? "Credits a month"
                    : "Credits over the run"}
              </Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <EligibleDays days={days} setDays={setDays} />
          </div>
        )}

        {kind === "every_n_weeks" && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-[160px_160px_minmax(0,1fr)]">
            <div>
              <Label htmlFor="quantity">Credits per cycle</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="interval_weeks">Every N weeks</Label>
              <Input
                id="interval_weeks"
                name="interval_weeks"
                type="number"
                min={2}
                value={intervalWeeks}
                onChange={(e) => setIntervalWeeks(e.target.value)}
              />
              <FieldHint>2 for every other week.</FieldHint>
            </div>
            <EligibleDays days={days} setDays={setDays} />
          </div>
        )}

        {kind === "explicit_dates" && (
          <div className="flex flex-col gap-3 rounded bg-panel-50 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-ink-700">Listed dates</span>
                <span className="ml-2 text-xs text-ink-500">
                  One row per date the order prints, with its count.
                </span>
              </div>
              <span className="text-[13px] font-semibold text-ink-900">
                {parsed.ok
                  ? `${plural(parsed.value.buckets.length, "date")} · ${plural(compiledTotal, "credit")}`
                  : ""}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {explicitRows.map((row, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <Input
                    name="explicit_date"
                    type="date"
                    value={row.date}
                    aria-label={`Date ${index + 1}`}
                    className="max-w-[190px]"
                    onChange={(e) =>
                      setExplicitRows(
                        explicitRows.map((r, i) =>
                          i === index ? { ...r, date: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Input
                    name="explicit_quantity"
                    type="number"
                    min={1}
                    placeholder="1"
                    value={row.quantity}
                    aria-label={`Credits on date ${index + 1}`}
                    className="max-w-[90px]"
                    onChange={(e) =>
                      setExplicitRows(
                        explicitRows.map((r, i) =>
                          i === index ? { ...r, quantity: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setExplicitRows(
                        explicitRows.length === 1
                          ? [{ date: "", quantity: "" }]
                          : explicitRows.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setExplicitRows([...explicitRows, { date: "", quantity: "" }])}
              >
                Add a date
              </Button>
            </div>
            <EligibleDays days={days} setDays={setDays} />
          </div>
        )}

        {kind === "week_grid" && (
          <div className="flex flex-col gap-3 rounded bg-panel-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-ink-700">Credits per week</span>
                <span className="ml-2 text-xs text-ink-500">
                  One cell per broadcast week between the line&apos;s dates. Click a week&apos;s
                  date to mark it with the quantity; type in a cell when a week differs.
                </span>
              </div>
              <span className="text-[13px] font-semibold text-ink-900">
                {weeks.length === 0
                  ? "No weeks — give the line an end date"
                  : `${plural(weeks.length, "week")} · ${gridStats.withCredits} with credits · ${gridStats.dark} dark · ${plural(gridStats.total, "credit")}${weeks.length >= MAX_WEEKS ? ` · capped at ${MAX_WEEKS}` : ""}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="grid_fill" className="text-[13px] text-ink-700">
                Credits in a marked week
              </label>
              <Input
                id="grid_fill"
                inputMode="numeric"
                value={fill}
                onChange={(e) => setFill(e.target.value)}
                className="w-16 text-center"
              />
              <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
              <Button type="button" variant="secondary" onClick={() => setAllWeeks(() => true)}>
                Mark every week
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAllWeeks((i) => i % 2 === 0)}
              >
                Every other week
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAllWeeks(() => false)}>
                Clear all
              </Button>
            </div>
            {weeks.length > 0 && (
              <div
                role="group"
                aria-label="Credits per week"
                className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-9"
              >
                {weeks.map((week, index) => {
                  const raw = weekQty[week.weekStart] ?? "0";
                  const on = toCount(raw) > 0;
                  const label =
                    index === 0 ||
                    (week.weekStart.slice(5, 7) === "01" && week.weekStart.slice(8, 10) <= "07")
                      ? `${shortDate(week.weekStart)}, ${week.weekStart.slice(0, 4)}`
                      : shortDate(week.weekStart);
                  return (
                    <div
                      key={week.weekStart}
                      className={cn(
                        "relative flex flex-col gap-0.5 rounded border px-1.5 pb-1.5 pt-1",
                        on ? "border-brand-primary bg-[#F3F9FD]" : "border-line bg-panel-50",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleWeek(week.weekStart)}
                        aria-pressed={on}
                        aria-label={`${on ? "Clear" : "Mark"} the week of ${week.weekStart}`}
                        className={cn(
                          "h-6 truncate rounded px-0.5 text-left text-[11px] font-semibold hover:bg-brand-surface hover:text-brand-link",
                          on ? "text-brand-link" : "text-ink-500",
                        )}
                      >
                        {label}
                      </button>
                      {week.partial && (
                        <span className="pointer-events-none absolute right-1.5 top-1.5 text-[9px] font-bold uppercase tracking-wider text-warning-fg">
                          partial
                        </span>
                      )}
                      <input
                        name={`week_quantity:${week.weekStart}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={raw}
                        aria-label={`Credits in the week of ${week.weekStart}`}
                        onChange={(e) =>
                          setWeekQty({ ...weekQty, [week.weekStart]: e.target.value })
                        }
                        className={cn(
                          controlClasses,
                          "h-9 px-1 py-0 text-center font-bold",
                          !on && "bg-panel-50 font-semibold text-ink-500",
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <FieldHint>
              Clicking a marked week clears it. A blank or 0 is a dark week and is saved as a real
              zero, the way the agency grid prints it. A week that starts before the line&apos;s
              first day or ends after its last is marked partial and counted at full quantity, never
              prorated.
            </FieldHint>
            <EligibleDays days={days} setDays={setDays} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pool_id">Inventory pool</Label>
            <Select
              id="pool_id"
              name="pool_id"
              value={poolId}
              onChange={(e) => {
                const nextPoolId = e.target.value;
                setPoolId(nextPoolId);
                const permitted = pools.find((pool) => pool.id === nextPoolId)?.programIds ?? null;
                if (programId && permitted !== null && !permitted.includes(programId))
                  setProgramId("");
              }}
            >
              <option value="">
                {programId ? "No pool — the program alone" : "Choose a pool, or a program below"}
              </option>
              {pools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}
                  {pool.hint ? ` ${pool.hint}` : ""}
                </option>
              ))}
            </Select>
            <FieldHint>
              The order&apos;s own name for the inventory, mapped to Log on the Pools screen. A
              bundle of programs that isn&apos;t here yet — &ldquo;Drive Time&rdquo;, &ldquo;ME and
              ATC&rdquo; — is a pool:{" "}
              <Link
                href="/underwriting/setup/pools?new=1"
                className="font-semibold text-brand-link"
              >
                create it
              </Link>
              , then pick it here.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="program_id">Program</Label>
            <SearchableSelect
              id="program_id"
              name="program_id"
              value={programId}
              onChange={setProgramId}
              options={offeredPrograms.map((program) => ({ id: program.id, label: program.name }))}
              placeholder={poolId ? "Any program in the pool" : "Choose a program, or a pool above"}
              emptyMessage={
                poolId ? "No program in this pool by that name." : "No program by that name."
              }
            />
            <FieldHint>
              A line needs a pool, a program, or both. Naming a program narrows the pool to it
              {permittedProgramIds !== null &&
                ` — only the ${plural(offeredPrograms.length, "program")} this pool covers ${offeredPrograms.length === 1 ? "is" : "are"} offered`}
              .
            </FieldHint>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-semibold text-ink-700">Time rule</legend>
          <Segmented
            name="time_mode"
            options={TIME_OPTIONS}
            value={timeMode}
            onChange={setTimeMode}
          />
          <FieldHint>{TIME_HINT[timeMode]}</FieldHint>
          {timeMode === "window" && (
            <div className="grid max-w-md grid-cols-2 gap-3">
              <div>
                <Label htmlFor="window_start">Window from</Label>
                <Input
                  id="window_start"
                  name="window_start"
                  type="time"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="window_end">Window to</Label>
                <Input
                  id="window_end"
                  name="window_end"
                  type="time"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                />
              </div>
            </div>
          )}
          {(timeMode === "preferred" || timeMode === "exact") && (
            <div className="max-w-[200px]">
              <Label htmlFor="preferred_time">
                {timeMode === "exact" ? "Exact time" : "Preferred time"}
              </Label>
              <Input
                id="preferred_time"
                name="preferred_time"
                type="time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
              />
            </div>
          )}
        </fieldset>

        <details className="rounded border border-line">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[13px]">
            <span>
              <span className="font-bold text-ink-900">More about this line</span>{" "}
              <span className="text-ink-500">
                — {serviceLevel === "bonus" ? "Bonus weight" : "Guaranteed"} ·{" "}
                {maxPerDay.trim() ? `at most ${maxPerDay} a day` : "no per-day cap"} ·{" "}
                {effectiveLabel ? `“${effectiveLabel}”` : "unlabelled"}
              </span>
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-4 border-t border-line p-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="service_level">Service level</Label>
              <Select
                id="service_level"
                name="service_level"
                value={serviceLevel}
                onChange={(e) => setServiceLevel(e.target.value as UwServiceLevel)}
              >
                <option value="guaranteed">Guaranteed</option>
                <option value="bonus">Bonus weight</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="max_per_day">Most per day</Label>
              <Input
                id="max_per_day"
                name="max_per_day"
                type="number"
                min={1}
                placeholder="No cap"
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(e.target.value)}
              />
              <FieldHint>Only if the order says so.</FieldHint>
            </div>
            <div>
              <Label htmlFor="flight_id">Flight</Label>
              <Select id="flight_id" name="flight_id" defaultValue={initial?.flight_id ?? ""}>
                <option value="">Whole contract</option>
                {flights.map((flight) => (
                  <option key={flight.id} value={flight.id}>
                    {flight.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="line_label">Label</Label>
              <Input
                id="line_label"
                name="label"
                maxLength={120}
                value={effectiveLabel}
                placeholder="AM Drive, 10 a week"
                onChange={(e) => {
                  setLabel(e.target.value);
                  setLabelEdited(true);
                }}
              />
              <FieldHint>Suggested from the pool and the rule until you change it.</FieldHint>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="source_text">The order&apos;s own wording</Label>
              <Input
                id="source_text"
                name="source_text"
                defaultValue={initial?.source_text ?? ""}
                placeholder="08/11/25 Sa-Su 6A-7P $44 6 $264 … 162 Weekend spots"
              />
              <FieldHint>Kept verbatim beside the line. Never interpreted as a rule.</FieldHint>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="makegood_policy_text">Makegood policy, as the order states</Label>
              <Input
                id="makegood_policy_text"
                name="makegood_policy_text"
                defaultValue={initial?.makegood_policy_text ?? ""}
                placeholder="Rescheduled within the program originally sponsored"
              />
            </div>
            <div>
              <Label htmlFor="line_notes">Notes</Label>
              <Textarea id="line_notes" name="notes" rows={1} defaultValue={initial?.notes ?? ""} />
            </div>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          {editing ? (
            <>
              <Button type="submit">Save line</Button>
              {cancelHref && (
                <a
                  href={cancelHref}
                  className="inline-flex items-center justify-center rounded px-4 py-2.5 text-sm font-bold text-ink-700 hover:bg-panel-50"
                >
                  Cancel
                </a>
              )}
            </>
          ) : (
            <>
              <Button type="submit" name="then" value="done">
                Add line
              </Button>
              <Button type="submit" name="then" value="another" variant="ghost">
                Add and start another
              </Button>
            </>
          )}
          <span className="flex-1" />
          {continueHref && (
            <a
              href={continueHref.href}
              className="inline-flex items-center justify-center rounded border border-brand-link px-4 py-2.5 text-sm font-bold text-brand-link hover:bg-brand-surface"
            >
              {continueHref.label}
            </a>
          )}
        </div>
      </form>

      <aside
        aria-label="Compiled demand"
        className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-5 lg:w-80"
      >
        <div className="rounded border border-line p-4.5 px-5 py-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
            This line compiles to
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-4xl font-bold leading-none text-ink-900">
              {compiledTotal}
            </span>
            <span className="text-sm text-ink-700">credits</span>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-ink-700">
            {demand.ok
              ? `${compiledDescription}${poolName || programName ? ` in ${poolName ?? programName}` : ""}.${partialCount > 0 ? ` ${plural(partialCount, "partial period")} counted at full quantity, never prorated.` : ""}`
              : demand.error}
          </p>
          {blockers.length > 0 && (
            <div className="mt-3 rounded bg-warning-bg px-3 py-2 text-[13px] leading-snug text-warning-fg">
              <div className="font-semibold">Still needed before this line can be saved</div>
              <ul className="mt-1 list-disc pl-4">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
          {lineMatches && (
            <p className="mt-3 text-[13px] font-semibold text-success-fg">
              ✓ Matches the order for this line
            </p>
          )}
          {lineOff && (
            <p className="mt-3 text-[13px] font-semibold text-warning-fg">
              The order says {statedN} for this line; this compiles to {compiledTotal} (
              {compiledTotal - statedN > 0 ? "+" : ""}
              {compiledTotal - statedN}). Saving is still allowed — the mismatch is kept as a
              warning.
            </p>
          )}
        </div>
        <div className="rounded border border-line px-5 py-4">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Contract total
          </div>
          <dl className="text-[13px]">
            {otherLines.map((line) => (
              <div
                key={line.label}
                className="flex justify-between gap-3 border-b border-line py-2"
              >
                <dt className="text-ink-700">{line.label}</dt>
                <dd className="font-semibold">{line.expected}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-b border-line py-2">
              <dt className="text-ink-700">
                {effectiveLabel || "This line"} <span className="text-ink-500">(this line)</span>
              </dt>
              <dd className="font-semibold">{compiledTotal}</dd>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t border-ink-900 py-2">
              <dt className="font-bold">Compiles to</dt>
              <dd className="font-bold">{contractTotal}</dd>
            </div>
            {statedTotalSpots != null && (
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-ink-700">On the order</dt>
                <dd className="font-semibold">{statedTotalSpots}</dd>
              </div>
            )}
          </dl>
          {statedTotalSpots != null && (
            <span
              className={cn(
                "mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
                contractTotal === statedTotalSpots
                  ? "bg-success-bg text-success-fg"
                  : "bg-warning-bg text-warning-fg",
              )}
            >
              {contractTotal === statedTotalSpots
                ? "Reconciles with the order"
                : `Off from the order by ${contractTotal - statedTotalSpots > 0 ? "+" : ""}${contractTotal - statedTotalSpots}`}
            </span>
          )}
          <FieldHint>
            A mismatch stays visible here and on the contract page. It never blocks saving: a
            partial week or a typo in the order itself is common.
          </FieldHint>
        </div>
      </aside>
    </div>
  );
}

function EligibleDays({ days, setDays }: { days: number[]; setDays: (days: number[]) => void }) {
  return (
    <div>
      <Label>Eligible days</Label>
      <DayPicker
        name="days_of_week"
        value={days}
        onToggle={(day) =>
          setDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day])
        }
      />
      <FieldHint>Leave all off for any day.</FieldHint>
    </div>
  );
}
