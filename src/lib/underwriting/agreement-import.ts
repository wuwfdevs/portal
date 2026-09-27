// Reading a contract's schedule out of its attached agreement
// (docs/underwriting-traffic-redesign.md §12). Pure: the strict JSON schema
// the model's answer must satisfy, the shape of that answer, and the
// conversion of it into the same ScheduleLineFormValues the schedule
// editor posts — so the existing parser (schedule-line-form.ts) is the
// validator and the schedule step's "compiles to N / the order says N"
// reconciliation is the check on the model's reading. No Supabase, no
// fetch; the model call is agreement-ai-import.ts (server-only) and the
// writes are the route's agreement-import-actions.ts.
//
// Closed sets are enums, the same trick the program-log importer uses for
// underwriters: a pool or program is one of the names on file or null,
// never a name the model made up, so "Carpool" resolves to the station's
// own pool and "AM drive" to the staff-mapped one rather than minting a
// second. Anything the model can't place lands in `unresolved` with the
// document's own words, for the staffer to enter by hand.

import type { UwScheduleEntryKind, UwServiceLevel, UwTimeMode } from "@/lib/database.types";
import { isValidDateISO } from "./dates";
import { describeScheduleLine } from "./demand";
import { totalQuantity } from "./demand-compiler";
import { parseScheduleLineForm, type ScheduleLineFormValues } from "./schedule-line-form";

// ---- What the model returns (mirrors buildAgreementOutputSchema exactly) ----

export const ENTRY_KINDS: UwScheduleEntryKind[] = [
  "fixed_days",
  "weekly_quota",
  "monthly_quota",
  "every_n_weeks",
  "explicit_dates",
  "week_grid",
  "range_total",
];
const TIME_MODES: UwTimeMode[] = ["any", "window", "preferred", "exact", "opening", "closing"];
const SERVICE_LEVELS: UwServiceLevel[] = ["guaranteed", "bonus"];

/** The duration a line gets when the order prints none — most WUWF credits are :30s; flagged on the proposal so nobody mistakes it for a transcription. */
export const DEFAULT_CREDIT_DURATION_SECONDS = 30;

export interface AgreementModelLine {
  /** A short name for the line, e.g. "Monday AM drive". */
  label: string;
  /** The order's own words for this instruction, verbatim. */
  source_text: string;
  entry_kind: UwScheduleEntryKind;
  count_per_day: number | null;
  quantity: number | null;
  interval_weeks: number | null;
  explicit_dates: { date: string; quantity: number }[];
  week_grid: { week_start: string; quantity: number }[];
  /** 0 = Sunday … 6 = Saturday; empty means any day. */
  days_of_week: number[];
  pool: string | null;
  program: string | null;
  time_mode: UwTimeMode;
  window_start: string | null;
  window_end: string | null;
  preferred_time: string | null;
  max_per_day: number | null;
  service_level: UwServiceLevel;
  duration_seconds: number | null;
  start_date: string;
  end_date: string | null;
  flight: string | null;
  stated_total: number | null;
  notes: string | null;
}

export interface AgreementModelOrder {
  effective_from: string | null;
  effective_to: string | null;
  stated_total_spots: number | null;
  sponsorship_total: number | null;
  affidavit_required: boolean | null;
  makegood_requires_agency_approval: boolean | null;
  separation_source_text: string | null;
  preemption_policy: string | null;
}

export interface AgreementModelFlight {
  name: string;
  start_date: string;
  end_date: string;
}

export interface AgreementModelOutput {
  order: AgreementModelOrder;
  flights: AgreementModelFlight[];
  lines: AgreementModelLine[];
  unresolved: { source_text: string; reason: string }[];
  notes: string[];
}

export interface AgreementSchemaNames {
  poolNames: string[];
  programNames: string[];
}

/**
 * The strict JSON schema for the model's answer. Strict mode wants every
 * property required and nullability spelled out, so unused fields are
 * null (or an empty array) rather than absent. Pools and programs are
 * enums of what is on file; with nothing on file the field can only be
 * null, since an empty enum is invalid.
 */
export function buildAgreementOutputSchema(names: AgreementSchemaNames) {
  const nullable = (type: "string" | "integer" | "number" | "boolean", description: string) => ({
    type: [type, "null"],
    description,
  });
  const nameEnum = (values: string[], description: string) =>
    values.length === 0
      ? { type: "null", description: `${description} Nothing is on file, so always null.` }
      : {
          anyOf: [{ type: "string", enum: values }, { type: "null" }],
          description,
        };

  const line = {
    type: "object",
    properties: {
      label: { type: "string", description: 'A short name for the line, e.g. "Monday AM drive".' },
      source_text: {
        type: "string",
        description:
          "The order's own words for this instruction, copied verbatim from the document.",
      },
      entry_kind: {
        type: "string",
        enum: ENTRY_KINDS,
        description:
          "How the order sells these credits. fixed_days: a set count on each listed weekday. weekly_quota: N a week on any of the listed days. monthly_quota: N a calendar month. every_n_weeks: N in one week out of every interval. explicit_dates: a printed list of dates. week_grid: an agency grid with a quantity per week. range_total: N over the whole run.",
      },
      count_per_day: nullable("integer", "fixed_days only: credits on each listed day. Else null."),
      quantity: nullable(
        "integer",
        "weekly_quota, monthly_quota, every_n_weeks, range_total: the quantity per period. Else null.",
      ),
      interval_weeks: nullable(
        "integer",
        "every_n_weeks only: the interval (2 for every other week). Else null.",
      ),
      explicit_dates: {
        type: "array",
        description:
          "explicit_dates only: each printed date (YYYY-MM-DD) with its count. Else empty.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            quantity: { type: "integer", description: "Credits on that date, usually 1." },
          },
          required: ["date", "quantity"],
          additionalProperties: false,
        },
      },
      week_grid: {
        type: "array",
        description:
          "week_grid only: one entry per week column, keyed by that week's Monday (YYYY-MM-DD), with the printed quantity — 0 for a dark week. Else empty.",
        items: {
          type: "object",
          properties: {
            week_start: { type: "string", description: "The week's Monday, YYYY-MM-DD" },
            quantity: { type: "integer", description: "Credits that week; 0 for a dark week." },
          },
          required: ["week_start", "quantity"],
          additionalProperties: false,
        },
      },
      days_of_week: {
        type: "array",
        items: { type: "integer", minimum: 0, maximum: 6 },
        description:
          "Eligible weekdays, 0 = Sunday through 6 = Saturday. fixed_days: the days the credit airs. Other kinds: the days the order restricts to, or empty for any day.",
      },
      pool: nameEnum(
        names.poolNames,
        "The inventory pool the order sells, exactly as listed, or null when the order names a program instead.",
      ),
      program: nameEnum(
        names.programNames,
        "The program the order names, exactly as listed, or null when it sells a pool or daypart.",
      ),
      time_mode: {
        type: "string",
        enum: TIME_MODES,
        description:
          'any: no time stated. window: between two times. preferred: "~7:49am" or "around". exact: "@ 8:19 AM" or a named feature at a fixed time. opening / closing: the program\'s first or last credit.',
      },
      window_start: nullable("string", "window only: HH:MM (24-hour). Else null."),
      window_end: nullable("string", "window only: HH:MM (24-hour). Else null."),
      preferred_time: nullable("string", "preferred or exact only: HH:MM (24-hour). Else null."),
      max_per_day: nullable(
        "integer",
        "Only when the order caps credits per day for this line. Else null.",
      ),
      service_level: {
        type: "string",
        enum: SERVICE_LEVELS,
        description: "bonus only when the order marks the line as bonus, no-charge, or $0.",
      },
      duration_seconds: nullable(
        "integer",
        "The credit length the order states for this line, in seconds (:30 is 30). Null if not printed.",
      ),
      start_date: { type: "string", description: "The line's first date, YYYY-MM-DD." },
      end_date: nullable("string", "The line's last date, YYYY-MM-DD, or null if open-ended."),
      flight: nullable(
        "string",
        "The name of the flight (an event or production) this line belongs to, matching an entry in flights. Null when the order has no flights.",
      ),
      stated_total: nullable(
        "integer",
        "The order's own printed count for this line, when it prints one. Null otherwise — never computed.",
      ),
      notes: nullable("string", "Anything else the order says about this line."),
    },
    required: [
      "label",
      "source_text",
      "entry_kind",
      "count_per_day",
      "quantity",
      "interval_weeks",
      "explicit_dates",
      "week_grid",
      "days_of_week",
      "pool",
      "program",
      "time_mode",
      "window_start",
      "window_end",
      "preferred_time",
      "max_per_day",
      "service_level",
      "duration_seconds",
      "start_date",
      "end_date",
      "flight",
      "stated_total",
      "notes",
    ],
    additionalProperties: false,
  };

  const order = {
    type: "object",
    properties: {
      effective_from: nullable("string", "The order's start date, YYYY-MM-DD."),
      effective_to: nullable("string", "The order's end date, YYYY-MM-DD."),
      stated_total_spots: nullable(
        "integer",
        "The total number of spots the order prints for the whole order, if it prints one.",
      ),
      sponsorship_total: nullable(
        "number",
        "The order's total dollar amount, if printed, as a number.",
      ),
      affidavit_required: nullable(
        "boolean",
        'Whether the order asks for affidavits ("Affidavits Needed: YES"). Null if not stated.',
      ),
      makegood_requires_agency_approval: nullable(
        "boolean",
        "True when the order says makegoods must be approved by the agency. Null if not stated.",
      ),
      separation_source_text: nullable(
        "string",
        'The order\'s separation instruction verbatim, if any (e.g. "3").',
      ),
      preemption_policy: nullable(
        "string",
        "The order's preemption / rescheduling language verbatim, if any.",
      ),
    },
    required: [
      "effective_from",
      "effective_to",
      "stated_total_spots",
      "sponsorship_total",
      "affidavit_required",
      "makegood_requires_agency_approval",
      "separation_source_text",
      "preemption_policy",
    ],
    additionalProperties: false,
  };

  const flight = {
    type: "object",
    properties: {
      name: { type: "string", description: "The event or production as the order names it." },
      start_date: { type: "string", description: "YYYY-MM-DD" },
      end_date: { type: "string", description: "YYYY-MM-DD" },
    },
    required: ["name", "start_date", "end_date"],
    additionalProperties: false,
  };

  return {
    type: "object",
    properties: {
      order,
      flights: {
        type: "array",
        items: flight,
        description:
          "Only for an order organised around events or productions, each with its own dates and spots. Empty otherwise.",
      },
      lines: { type: "array", items: line },
      unresolved: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source_text: { type: "string", description: "The instruction verbatim." },
            reason: { type: "string", description: "Why it could not be expressed as a line." },
          },
          required: ["source_text", "reason"],
          additionalProperties: false,
        },
      },
      notes: {
        type: "array",
        items: { type: "string" },
        description:
          "Anything else worth a staffer's eye: copy the order prints, a date that doesn't fall on the weekday it names, a total that doesn't add up.",
      },
    },
    required: ["order", "flights", "lines", "unresolved", "notes"],
    additionalProperties: false,
  };
}

// ---- Turning the answer into the schedule editor's own values -------------

export interface NamedId {
  id: string;
  name: string;
}

export interface AgreementContractFacts {
  effective_from: string;
  effective_to: string | null;
  stated_total_spots: number | null;
  sponsorship_total: number | null;
  affidavit_required: boolean;
  makegood_requires_agency_approval: boolean;
  separation_source_text: string | null;
  preemption_policy: string | null;
}

export interface ProposalContext {
  pools: NamedId[];
  programs: NamedId[];
  /** The contract's existing active flights. */
  flights: NamedId[];
  contract: AgreementContractFacts;
}

/** A flight the order names that the contract doesn't have yet — created when the line that needs it is applied. */
export interface ProposedFlight {
  name: string;
  start_date: string;
  end_date: string;
}

export type ProposedLineCompile =
  { ok: true; expected: number; bucketCount: number } | { ok: false; errors: string[] };

export interface ProposedLine {
  /** Position in the model's answer; the client uses it as the row key. */
  index: number;
  values: ScheduleLineFormValues;
  poolName: string | null;
  programName: string | null;
  /** The flight the line belongs to, when it names one the contract already has. */
  flightName: string | null;
  /** A flight to create for this line, when the order names one the contract doesn't have. */
  newFlight: ProposedFlight | null;
  description: string;
  compile: ProposedLineCompile;
  warnings: string[];
}

export type OrderUpdateField = keyof AgreementContractFacts;

export interface ProposedOrderUpdate {
  field: OrderUpdateField;
  label: string;
  /** Rendered for the review. */
  proposedText: string;
  value: string | number | boolean;
}

export interface AgreementProposal {
  lines: ProposedLine[];
  /** Order facts the document states that the contract doesn't have yet. */
  orderUpdates: ProposedOrderUpdate[];
  /** Order facts where the document and the contract disagree — shown, never applied. */
  orderConflicts: string[];
  unresolved: { source_text: string; reason: string }[];
  notes: string[];
  /** What the lines that compile add up to. */
  expectedTotal: number;
  /** The order's total, from the contract or the document, for the reconciliation line. */
  statedTotalSpots: number | null;
}

function findByName(list: NamedId[], name: string | null): NamedId | null {
  if (name === null) return null;
  const wanted = name.trim().toLowerCase();
  return list.find((entry) => entry.name.trim().toLowerCase() === wanted) ?? null;
}

function intText(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "" : String(Math.trunc(value));
}

function timeText(value: string | null): string {
  if (value === null) return "";
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return "";
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

function dateText(value: string | null): string {
  return value !== null && isValidDateISO(value) ? value : "";
}

/** The model's line as the editor would have posted it — every field a string, unused ones blank. */
export function formValuesFromModelLine(
  line: AgreementModelLine,
  resolved: { poolId: string | null; programId: string | null; flightId: string | null },
): ScheduleLineFormValues {
  const kind = line.entry_kind;
  const usesQuantity =
    kind === "weekly_quota" ||
    kind === "monthly_quota" ||
    kind === "every_n_weeks" ||
    kind === "range_total";
  return {
    label: line.label.trim(),
    entry_kind: kind,
    days_of_week: [...new Set(line.days_of_week.filter((d) => Number.isInteger(d)))].sort(),
    count_per_day: kind === "fixed_days" ? intText(line.count_per_day) : "",
    quantity: usesQuantity ? intText(line.quantity) : "",
    interval_weeks: kind === "every_n_weeks" ? intText(line.interval_weeks) : "",
    pool_id: resolved.poolId ?? "",
    program_id: resolved.programId ?? "",
    time_mode: line.time_mode,
    window_start: line.time_mode === "window" ? timeText(line.window_start) : "",
    window_end: line.time_mode === "window" ? timeText(line.window_end) : "",
    preferred_time:
      line.time_mode === "preferred" || line.time_mode === "exact"
        ? timeText(line.preferred_time)
        : "",
    max_per_day: intText(line.max_per_day),
    service_level: line.service_level,
    duration_seconds: intText(line.duration_seconds ?? DEFAULT_CREDIT_DURATION_SECONDS),
    start_date: dateText(line.start_date),
    end_date: dateText(line.end_date),
    flight_id: resolved.flightId ?? "",
    stated_total: intText(line.stated_total),
    source_text: line.source_text.trim(),
    makegood_policy_text: "",
    notes: line.notes?.trim() ?? "",
    explicit_dates:
      kind === "explicit_dates"
        ? line.explicit_dates.map((entry) => ({
            date: dateText(entry.date),
            quantity: intText(entry.quantity),
          }))
        : [],
    week_grid:
      kind === "week_grid"
        ? line.week_grid.map((week) => ({
            week_start: dateText(week.week_start),
            quantity: intText(week.quantity),
          }))
        : [],
  };
}

const ORDER_FIELD_LABEL: Record<OrderUpdateField, string> = {
  effective_from: "Run start",
  effective_to: "Run end",
  stated_total_spots: "Total spots on the order",
  sponsorship_total: "Sponsorship total",
  affidavit_required: "Affidavits required",
  makegood_requires_agency_approval: "Makegoods need agency approval",
  separation_source_text: "Separation instruction",
  preemption_policy: "Preemption policy",
};

/**
 * Order-level facts: proposed only where the contract has nothing yet (a
 * blank field, or a policy flag still at its default false), and listed as
 * a conflict — never applied — where the contract already says something
 * different. The contract's own entry wins; the document's reading is a
 * prompt to look.
 */
function proposeOrderUpdates(
  order: AgreementModelOrder,
  contract: AgreementContractFacts,
): { updates: ProposedOrderUpdate[]; conflicts: string[] } {
  const updates: ProposedOrderUpdate[] = [];
  const conflicts: string[] = [];

  const consider = (
    field: OrderUpdateField,
    proposed: string | number | boolean | null,
    current: string | number | boolean | null,
    render: (value: string | number | boolean) => string,
  ) => {
    if (proposed === null || proposed === "" || proposed === false) return;
    const empty = current === null || current === "" || current === false;
    if (empty) {
      updates.push({
        field,
        label: ORDER_FIELD_LABEL[field],
        proposedText: render(proposed),
        value: proposed,
      });
    } else if (current !== proposed) {
      conflicts.push(
        `${ORDER_FIELD_LABEL[field]}: the contract says ${render(current)}, the document says ${render(proposed)}.`,
      );
    }
  };

  const text = (value: string | number | boolean) => String(value);
  const dollars = (value: string | number | boolean) =>
    typeof value === "number" ? `$${value.toLocaleString()}` : String(value);
  const yes = (value: string | number | boolean) => (value === true ? "yes" : "no");

  consider("effective_from", dateText(order.effective_from) || null, contract.effective_from, text);
  consider("effective_to", dateText(order.effective_to) || null, contract.effective_to, text);
  consider("stated_total_spots", order.stated_total_spots, contract.stated_total_spots, text);
  consider("sponsorship_total", order.sponsorship_total, contract.sponsorship_total, dollars);
  consider("affidavit_required", order.affidavit_required, contract.affidavit_required, yes);
  consider(
    "makegood_requires_agency_approval",
    order.makegood_requires_agency_approval,
    contract.makegood_requires_agency_approval,
    yes,
  );
  consider(
    "separation_source_text",
    order.separation_source_text?.trim() || null,
    contract.separation_source_text,
    text,
  );
  consider(
    "preemption_policy",
    order.preemption_policy?.trim() || null,
    contract.preemption_policy,
    text,
  );

  return { updates, conflicts };
}

/**
 * The model's answer as a proposal for the schedule step: each line as the
 * editor's own values, parsed by the same parser a manual entry goes
 * through, with what it compiles to; the pool/program/flight it resolved
 * to; and anything about it a staffer should look at before adding it.
 */
export function proposeScheduleFromModelOutput(
  output: AgreementModelOutput,
  context: ProposalContext,
): AgreementProposal {
  const lines: ProposedLine[] = output.lines.map((modelLine, index) => {
    const warnings: string[] = [];

    const pool = findByName(context.pools, modelLine.pool);
    if (modelLine.pool !== null && !pool)
      warnings.push(`"${modelLine.pool}" isn't a pool on file — choose one after adding.`);
    const program = findByName(context.programs, modelLine.program);
    if (modelLine.program !== null && !program)
      warnings.push(`"${modelLine.program}" isn't a program on file — choose one after adding.`);

    let flight: NamedId | null = null;
    let newFlight: ProposedFlight | null = null;
    if (modelLine.flight !== null) {
      flight = findByName(context.flights, modelLine.flight);
      if (!flight) {
        const wanted = modelLine.flight.trim().toLowerCase();
        const named = output.flights.find((f) => f.name.trim().toLowerCase() === wanted);
        if (named && isValidDateISO(named.start_date) && isValidDateISO(named.end_date)) {
          newFlight = {
            name: named.name.trim(),
            start_date: named.start_date,
            end_date: named.end_date,
          };
        } else {
          warnings.push(
            `The order puts this line in a flight ("${modelLine.flight}") it doesn't describe — add the flight by hand if it matters.`,
          );
        }
      }
    }

    if (modelLine.duration_seconds === null)
      warnings.push(
        `The order doesn't state a length for this line; ${DEFAULT_CREDIT_DURATION_SECONDS}s is assumed.`,
      );

    const values = formValuesFromModelLine(modelLine, {
      poolId: pool?.id ?? null,
      programId: program?.id ?? null,
      flightId: flight?.id ?? null,
    });
    const parsed = parseScheduleLineForm(values);

    const description = parsed.ok
      ? describeScheduleLine(
          { ...parsed.value.line, status: "active", cancelled_from: null },
          { poolName: pool?.name ?? null, programName: program?.name ?? null },
        )
      : values.label || modelLine.source_text;

    const compile: ProposedLineCompile = parsed.ok
      ? {
          ok: true,
          expected: totalQuantity(parsed.value.buckets),
          bucketCount: parsed.value.buckets.length,
        }
      : { ok: false, errors: parsed.errors };

    if (
      compile.ok &&
      modelLine.stated_total !== null &&
      modelLine.stated_total !== compile.expected
    )
      warnings.push(
        `The order says ${modelLine.stated_total} for this line; as read it compiles to ${compile.expected}.`,
      );

    return {
      index,
      values,
      poolName: pool?.name ?? null,
      programName: program?.name ?? null,
      flightName: flight?.name ?? null,
      newFlight,
      description,
      compile,
      warnings,
    };
  });

  const { updates, conflicts } = proposeOrderUpdates(output.order, context.contract);
  const expectedTotal = lines.reduce(
    (sum, line) => sum + (line.compile.ok ? line.compile.expected : 0),
    0,
  );
  const statedTotalSpots =
    context.contract.stated_total_spots ??
    (output.order.stated_total_spots !== null && Number.isFinite(output.order.stated_total_spots)
      ? output.order.stated_total_spots
      : null);

  return {
    lines,
    orderUpdates: updates,
    orderConflicts: conflicts,
    unresolved: output.unresolved.map((entry) => ({
      source_text: entry.source_text.trim(),
      reason: entry.reason.trim(),
    })),
    notes: output.notes.map((note) => note.trim()).filter((note) => note !== ""),
    expectedTotal,
    statedTotalSpots,
  };
}

/** Whether a parsed model answer has the shape the schema promised — a cheap guard before conversion. */
export function isAgreementModelOutput(value: unknown): value is AgreementModelOutput {
  if (value === null || typeof value !== "object") return false;
  const output = value as Record<string, unknown>;
  return (
    output.order !== null &&
    typeof output.order === "object" &&
    Array.isArray(output.flights) &&
    Array.isArray(output.lines) &&
    Array.isArray(output.unresolved) &&
    Array.isArray(output.notes)
  );
}
