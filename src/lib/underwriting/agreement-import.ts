// Creating a contract from its signed agreement (docs/underwriting-
// traffic-redesign.md §12). Pure: the strict JSON schema the model's answer
// must satisfy, the shape of that answer, the merge of the order's facts
// with what the staffer typed, the conversion of each read line into the
// same ScheduleLineFormValues the schedule editor posts — so the existing
// parser (schedule-line-form.ts) is the validator and the schedule step's
// "compiles to N / the order says N" badge is the check on the model's
// reading — and the shape of the reading kept on the contract afterwards.
// No Supabase, no fetch; the model call is agreement-ai-import.ts
// (server-only) and the writes are the route's agreement-import-actions.ts.
//
// Closed sets are enums, the same trick the program-log importer uses for
// underwriters: the underwriter, a pool, or a program is one of the names
// on file (the underwriter with a NEW escape, since a document can name a
// sponsor nobody has added yet), never a name the model made up — so
// "Carpool" resolves to the station's own pool and "Autumn Beck Blackledge,
// Attorneys at Law" to the underwriter already on file rather than minting
// a second. Anything the model can't place lands in `unresolved` with the
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

/** The underwriter enum's escape hatch: a sponsor not yet on file. */
export const NEW_UNDERWRITER = "NEW";

/** The duration a line gets when the order prints none — most WUWF credits are :30s; flagged on the line so nobody mistakes it for a transcription. */
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
  /** One of the underwriter names on file, or NEW_UNDERWRITER. */
  underwriter: string | null;
  new_underwriter_name: string | null;
  contract_identifier: string | null;
  effective_from: string | null;
  effective_to: string | null;
  sponsorship_category: string | null;
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
  underwriterNames: string[];
  poolNames: string[];
  programNames: string[];
}

/**
 * The strict JSON schema for the model's answer. Strict mode wants every
 * property required and nullability spelled out, so unused fields are
 * null (or an empty array) rather than absent. Underwriters, pools and
 * programs are enums of what is on file; with nothing on file the field
 * can only be null (or NEW, for the underwriter), since an empty enum is
 * invalid.
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
      underwriter: {
        anyOf: [
          { type: "string", enum: [...names.underwriterNames, NEW_UNDERWRITER] },
          { type: "null" },
        ],
        description: `The sponsor the order is for, exactly as listed, when the document is clearly for that business even if it phrases the name differently; "${NEW_UNDERWRITER}" if not on file; null only if the document names no sponsor at all.`,
      },
      new_underwriter_name: nullable(
        "string",
        `Only when underwriter is "${NEW_UNDERWRITER}": the sponsor's name as the document prints it.`,
      ),
      contract_identifier: nullable(
        "string",
        "The order, insertion-order, contract or estimate number the document prints, if any.",
      ),
      effective_from: nullable("string", "The order's start date, YYYY-MM-DD."),
      effective_to: nullable("string", "The order's end date, YYYY-MM-DD."),
      sponsorship_category: nullable(
        "string",
        "What the order sponsors, in its own words (a program name, an event, a campaign), if it says.",
      ),
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
      "underwriter",
      "new_underwriter_name",
      "contract_identifier",
      "effective_from",
      "effective_to",
      "sponsorship_category",
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

// ---- The order's facts: what was typed wins, the document fills the rest ----

export interface NamedId {
  id: string;
  name: string;
}

function findByName(list: NamedId[], name: string | null): NamedId | null {
  if (name === null) return null;
  const wanted = name.trim().toLowerCase();
  return list.find((entry) => entry.name.trim().toLowerCase() === wanted) ?? null;
}

function dateText(value: string | null): string {
  return value !== null && isValidDateISO(value) ? value : "";
}

/** The order step's own fields, as posted — every one optional when a document is uploaded. */
export interface TypedOrderFields {
  underwriter_id: string;
  contract_identifier: string;
  effective_from: string;
  effective_to: string;
  sponsorship_total: string;
  sponsorship_category: string;
  notes: string;
}

/** The uw_contracts facts a draft is created with. */
export interface DraftContractFacts {
  underwriter_id: string;
  contract_identifier: string;
  effective_from: string;
  effective_to: string | null;
  sponsorship_total: number | null;
  sponsorship_category: string | null;
  notes: string | null;
  stated_total_spots: number | null;
  affidavit_required: boolean;
  makegood_requires_agency_approval: boolean;
  separation_source_text: string | null;
  preemption_policy: string | null;
}

export type OrderFactsResult =
  { ok: true; value: DraftContractFacts; warnings: string[] } | { ok: false; error: string };

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * What the staffer typed on the order step takes precedence; the
 * document's reading fills what was left blank. The underwriter must be
 * on file — a document naming a sponsor nobody has added is refused with
 * the name, rather than a sponsor row being minted from a reading. A
 * missing order number gets a placeholder and a warning, since the column
 * is required and the order step edits it afterwards.
 */
export function mergeOrderFacts(
  typed: TypedOrderFields,
  order: AgreementModelOrder,
  underwriters: NamedId[],
): OrderFactsResult {
  const warnings: string[] = [];

  const typedUnderwriter = underwriters.find((entry) => entry.id === typed.underwriter_id.trim());
  const readUnderwriter =
    order.underwriter === null || order.underwriter === NEW_UNDERWRITER
      ? null
      : findByName(underwriters, order.underwriter);
  const underwriter = typedUnderwriter ?? readUnderwriter;
  if (!underwriter) {
    const named = text(order.new_underwriter_name) ?? text(order.underwriter);
    return {
      ok: false,
      error:
        named && named !== NEW_UNDERWRITER
          ? `The document is for "${named}", who isn't an underwriter on file yet — add them under Underwriters and upload again, or choose the underwriter above.`
          : "The document doesn't name a sponsor that's on file — choose the underwriter above and upload again.",
    };
  }

  const effectiveFrom = dateText(typed.effective_from) || dateText(order.effective_from);
  if (effectiveFrom === "")
    return {
      ok: false,
      error: "The document doesn't state a start date — type the run dates above and upload again.",
    };
  const effectiveTo = dateText(typed.effective_to) || dateText(order.effective_to) || null;
  if (effectiveTo !== null && effectiveTo < effectiveFrom)
    return { ok: false, error: "The run's end date is before its start date." };

  let identifier = text(typed.contract_identifier) ?? text(order.contract_identifier);
  if (identifier === null) {
    identifier = `${underwriter.name} ${effectiveFrom}`;
    warnings.push(
      `The document prints no order number, so the contract is identified as "${identifier}" — change it on the Order step.`,
    );
  }

  const typedTotal = Number.parseFloat(typed.sponsorship_total);
  const sponsorshipTotal = Number.isFinite(typedTotal)
    ? typedTotal
    : order.sponsorship_total !== null && Number.isFinite(order.sponsorship_total)
      ? order.sponsorship_total
      : null;
  const statedTotalSpots =
    order.stated_total_spots !== null &&
    Number.isInteger(order.stated_total_spots) &&
    order.stated_total_spots >= 0
      ? order.stated_total_spots
      : null;

  return {
    ok: true,
    value: {
      underwriter_id: underwriter.id,
      contract_identifier: identifier.slice(0, 120),
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      sponsorship_total: sponsorshipTotal,
      sponsorship_category: text(typed.sponsorship_category) ?? text(order.sponsorship_category),
      notes: text(typed.notes),
      stated_total_spots: statedTotalSpots,
      affidavit_required: order.affidavit_required === true,
      makegood_requires_agency_approval: order.makegood_requires_agency_approval === true,
      separation_source_text: text(order.separation_source_text),
      preemption_policy: text(order.preemption_policy),
    },
    warnings,
  };
}

// ---- Each read line as the schedule editor's own values ------------------

export interface ProposalContext {
  pools: NamedId[];
  programs: NamedId[];
  /** The contract's existing active flights. */
  flights: NamedId[];
}

/** A flight the order names that the contract doesn't have yet — created with the line that needs it. */
export interface ProposedFlight {
  name: string;
  start_date: string;
  end_date: string;
}

export type ProposedLineCompile =
  { ok: true; expected: number; bucketCount: number } | { ok: false; errors: string[] };

export interface ProposedLine {
  /** Position in the model's answer — the key the reading's per-line outcomes are stored by. */
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

export interface AgreementProposal {
  lines: ProposedLine[];
  unresolved: { source_text: string; reason: string }[];
  notes: string[];
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

/**
 * The model's answer as lines for the schedule: each as the editor's own
 * values, parsed by the same parser a manual entry goes through, with
 * what it compiles to; the pool/program/flight it resolved to; and
 * anything about it a staffer should look at. Called once when the
 * contract is created (to save what compiles) and again on the schedule
 * step (to list what didn't) — pure, so the two agree.
 */
export function proposeScheduleFromModelOutput(
  output: AgreementModelOutput,
  context: ProposalContext,
): AgreementProposal {
  const lines: ProposedLine[] = output.lines.map((modelLine, index) => {
    const warnings: string[] = [];

    const pool = findByName(context.pools, modelLine.pool);
    if (modelLine.pool !== null && !pool)
      warnings.push(`"${modelLine.pool}" isn't a pool on file — choose one.`);
    const program = findByName(context.programs, modelLine.program);
    if (modelLine.program !== null && !program)
      warnings.push(`"${modelLine.program}" isn't a program on file — choose one.`);

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

  return {
    lines,
    unresolved: output.unresolved.map((entry) => ({
      source_text: entry.source_text.trim(),
      reason: entry.reason.trim(),
    })),
    notes: output.notes.map((note) => note.trim()).filter((note) => note !== ""),
  };
}

// ---- What the contract keeps of the reading -------------------------------

/** One read line's outcome at creation: saved as a draft line, or not and why. */
export interface AgreementReadingLineOutcome {
  saved: boolean;
  /** Why the line wasn't saved: the parser's first error, or the pool/program check's. Null when saved. */
  error: string | null;
}

/** uw_contracts.agreement_reading — the raw answer plus what became of it. */
export interface AgreementReading {
  version: 1;
  read_at: string;
  document_path: string;
  output: AgreementModelOutput;
  /** Aligned with output.lines. */
  lines: AgreementReadingLineOutcome[];
  /** From merging the order's facts — a placeholder identifier, say. */
  warnings: string[];
}

/** Validates a stored agreement_reading (jsonb) back into an AgreementReading, or null when malformed. */
export function parseAgreementReading(raw: unknown): AgreementReading | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const reading = raw as Record<string, unknown>;
  if (reading.version !== 1) return null;
  if (typeof reading.read_at !== "string" || typeof reading.document_path !== "string") return null;
  if (!isAgreementModelOutput(reading.output)) return null;
  if (!Array.isArray(reading.lines) || !Array.isArray(reading.warnings)) return null;
  const lines: AgreementReadingLineOutcome[] = [];
  for (const entry of reading.lines) {
    if (entry === null || typeof entry !== "object") return null;
    const { saved, error } = entry as Record<string, unknown>;
    if (typeof saved !== "boolean" || (error !== null && typeof error !== "string")) return null;
    lines.push({ saved, error: error ?? null });
  }
  if (lines.length !== reading.output.lines.length) return null;
  return {
    version: 1,
    read_at: reading.read_at,
    document_path: reading.document_path,
    output: reading.output,
    lines,
    warnings: reading.warnings.filter((entry): entry is string => typeof entry === "string"),
  };
}
