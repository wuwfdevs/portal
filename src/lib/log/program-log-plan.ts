// The program-log import's plan model and assembly — pure, no Supabase,
// colocated test. The model (program-log-ai-import.ts) reads the uploaded
// PDF, pulls what it needs through the lookup tools in
// program-log-lookups.ts, and returns the day's plan as structured output
// in the ProgramLogModelOutput shape below. This module turns that into
// the ProgramLogPlan the preview renders and the executor
// (import-actions.ts) writes: it resolves every id the model named
// against the same lists the tools served (the check the database's
// foreign keys would make on insert, done early so the preview can say
// so), groups credit items into copy plans, counts airings from what will
// actually be placed, and carries the model's own notes and unresolved
// rows through. It makes no parsing decisions — what the document says is
// the model's call, and there is deliberately no verification, matching,
// or dedup layer here (see docs/log-design.md §8's 2026-09-22 revision for
// why the previous one was removed).

import type { LogOpportunityRequirement } from "@/lib/database.types";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import { estimateReadSeconds } from "@/lib/log/read-time";
import type { ScheduleEntryLike } from "@/lib/log/schedule";

// ---- Database context the tools serve and the assembler resolves against --

export interface PlanScheduleEntry extends ScheduleEntryLike {
  id: string;
  program_id: string;
  program_name: string;
  clock_template_id: string;
  /** "05:00:00" — as Postgres renders a time column. */
  air_time: string;
  duration_minutes: number;
}

export interface PlanExistingRundown {
  id: string;
  program_id: string;
  source: string;
}

export interface PlanUnderwriter {
  id: string;
  name: string;
}

export interface PlanCopy {
  id: string;
  underwriter_id: string | null;
  label: string;
  cart_identifier: string | null;
  script: string | null;
  duration_seconds: number | null;
}

export interface PlanContentItem {
  id: string;
  title: string;
  content_type: string;
}

// ---- What the model returns (mirrors buildPlanOutputSchema exactly) -------

/** The underwriter enum's escape hatch: an advertiser not yet on file. */
export const NEW_UNDERWRITER = "NEW";

export type ModelItemKind = "credit" | "content" | "live_read";

export interface ModelItem {
  kind: ModelItemKind;
  /** One of the known underwriter names, or NEW_UNDERWRITER. Credits only. */
  underwriter: string | null;
  new_underwriter_name: string | null;
  existing_copy_id: string | null;
  label: string | null;
  cart: string | null;
  /** Verbatim from the document. Credits and live reads. */
  script: string | null;
  /** From search_content_items. Content items only. */
  content_item_id: string | null;
  title: string | null;
  duration_seconds: number | null;
  /**
   * The printed text is instructions for playing a recorded spot ("Please
   * play the #2 spot…"), not words read on air — so its printed length is
   * the real one, and a read-time estimate would be meaningless.
   */
  plays_recording: boolean;
}

export interface ModelBreak {
  /** "HH:MM:SS" as printed. */
  time: string;
  label: string;
  window_seconds: number | null;
  items: ModelItem[];
}

export interface ModelRundown {
  /** From schedule_for_date. */
  schedule_entry_id: string;
  program_name: string;
  breaks: ModelBreak[];
}

export interface ModelUnresolved {
  time: string;
  description: string;
  reason: string;
}

export interface ModelNote {
  time: string;
  description: string;
}

export interface ProgramLogModelOutput {
  air_date: string;
  rundowns: ModelRundown[];
  unresolved: ModelUnresolved[];
  notes: ModelNote[];
}

/**
 * The strict JSON schema the model's final answer must satisfy. Strict
 * mode needs every property listed as required and nullability spelled
 * out, so optional fields are `["…", "null"]`. The underwriter enum is the
 * closed set that keeps "Autumn Beck Blackledge, Attorneys at Law" from
 * becoming a second underwriter — NEW is the only way off the list.
 */
export function buildPlanOutputSchema(underwriterNames: string[]) {
  const nullable = (type: "string" | "integer", description: string) => ({
    type: [type, "null"],
    description,
  });
  const item = {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["credit", "content", "live_read"],
        description:
          "credit: an underwriting credit (has a script and an underwriter). content: a fill matched to a library item via search_content_items. live_read: any other fill, kept by title.",
      },
      underwriter: {
        anyOf: [{ type: "string", enum: [...underwriterNames, NEW_UNDERWRITER] }, { type: "null" }],
        description: `Credits only: the underwriter this credit is for, exactly as listed, or "${NEW_UNDERWRITER}" if not on file. Null for other kinds.`,
      },
      new_underwriter_name: nullable(
        "string",
        `Credits only, and only when underwriter is "${NEW_UNDERWRITER}": the advertiser's name as printed or as the script names it.`,
      ),
      existing_copy_id: nullable(
        "string",
        "Credits only: the copy_id from list_copy_for_underwriter that this credit is the same message as, else null.",
      ),
      label: nullable(
        "string",
        'Credits only: the copy label as printed (the part after " / " in "Underwriter / Copy 1"), or "Live read" for a cart-less credit.',
      ),
      cart: nullable(
        "string",
        "Credits only: the DAD cart number printed on this credit's own row, else null.",
      ),
      script: nullable(
        "string",
        "Credits and live reads: the full script copied character for character from the document. Null only if nothing is printed.",
      ),
      content_item_id: nullable(
        "string",
        "Content only: a content_item_id returned by search_content_items.",
      ),
      title: nullable("string", "Content and live reads: the printed description of the fill."),
      duration_seconds: nullable("integer", "The printed length in seconds, else null."),
      plays_recording: {
        type: "boolean",
        description:
          'Credits and live reads: true when the printed text tells the host to play a recorded spot (e.g. "Please play the #2 spot…") rather than being words read on air. False otherwise.',
      },
    },
    required: [
      "kind",
      "underwriter",
      "new_underwriter_name",
      "existing_copy_id",
      "label",
      "cart",
      "script",
      "content_item_id",
      "title",
      "duration_seconds",
      "plays_recording",
    ],
    additionalProperties: false,
  };
  const brk = {
    type: "object",
    properties: {
      time: { type: "string", description: "The break's printed start time, HH:MM:SS." },
      label: {
        type: "string",
        description: 'e.g. "Underwriting break", or the fill\'s own name for a standalone fill.',
      },
      window_seconds: nullable(
        "integer",
        "The avail window in seconds from the marker's (mm:ss), else null.",
      ),
      items: {
        type: "array",
        items: item,
        description:
          "Every item scheduled in this window, in printed order. Each printed item appears exactly once across the whole plan.",
      },
    },
    required: ["time", "label", "window_seconds", "items"],
    additionalProperties: false,
  };
  const rundown = {
    type: "object",
    properties: {
      schedule_entry_id: {
        type: "string",
        description: "A schedule_entry_id from schedule_for_date.",
      },
      program_name: { type: "string", description: "The program's name as the schedule lists it." },
      breaks: { type: "array", items: brk },
    },
    required: ["schedule_entry_id", "program_name", "breaks"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      air_date: { type: "string", description: "The log's broadcast date, YYYY-MM-DD." },
      rundowns: {
        type: "array",
        items: rundown,
        description: "One per program that appears in the log and is on that date's schedule.",
      },
      unresolved: {
        type: "array",
        items: {
          type: "object",
          properties: {
            time: { type: "string" },
            description: { type: "string" },
            reason: { type: "string" },
          },
          required: ["time", "description", "reason"],
          additionalProperties: false,
        },
        description:
          "Rows you could not place: a program not on the schedule, a credit whose underwriter you could not identify, anything ambiguous.",
      },
      notes: {
        type: "array",
        items: {
          type: "object",
          properties: { time: { type: "string" }, description: { type: "string" } },
          required: ["time", "description"],
          additionalProperties: false,
        },
        description:
          "Operational reminders (meter readings, fader cues) — not schedulable content.",
      },
    },
    required: ["air_date", "rundowns", "unresolved", "notes"],
    additionalProperties: false,
  } as const;
}

// ---- The plan the preview renders and the executor writes ------------------

/** One distinct credit across the day (the same copy often airs several times). */
export interface CopyPlan {
  /** Stable key item plans reference: `copy:<existing id>` or `new:<underwriter>|<label>|<cart>`. */
  key: string;
  underwriterName: string;
  /** True when no existing underwriter matches by name. */
  underwriterIsNew: boolean;
  label: string;
  cart: string | null;
  script: string | null;
  durationSeconds: number | null;
  /** Existing uw_copy id to reuse; null → create. */
  existingCopyId: string | null;
  /**
   * Reused copy whose library script differs from the export's: the
   * import updates the library row to `script` (the export's text). The
   * traffic system is the source of truth for a credit's wording until
   * Underwriting staff maintain copy in their own tool, and the library
   * has held text damaged by earlier importer bugs precisely because the
   * export was never allowed to correct it.
   */
  scriptChanged: boolean;
  /** The library's current script for reused copy, so the preview can show what an update replaces. */
  libraryScript: string | null;
  airings: number;
}

export type ItemPlan =
  | { kind: "credit"; copyKey: string; title: string; durationSeconds: number }
  | { kind: "content"; contentItemId: string; title: string; durationSeconds: number }
  | { kind: "live_read"; title: string; durationSeconds: number; script: string | null };

export interface BreakPlan {
  /** Seconds from station-local midnight. */
  startSeconds: number;
  /** "06:06:00" — for display. */
  time: string;
  label: string;
  availableDurationSeconds: number;
  items: ItemPlan[];
  /**
   * Where this break sits on the program's clock — set by
   * alignPlanToClock (program-log-clock-alignment.ts), absent on the
   * model's raw reading. The executor writes only aligned breaks.
   */
  placement?: BreakPlacement;
}

/**
 * Which clock structure a written break takes its times from. The clock
 * defines every break's window; the export decides what goes in it (see
 * program-log-clock-alignment.ts):
 * - `opportunity` — a marked local opportunity, exactly as generation
 *   builds it (so opportunity assignments apply);
 * - `clock_slot` — a network slot (or run of contiguous slots) nobody
 *   marked, where the export nonetheless scheduled something — the export
 *   prevails, the clock supplies the window;
 * - `export` — the clock has no avail-sized slot at that point (a
 *   placeholder clock, a long program segment), so the export's own
 *   window is the only one there is.
 */
export type BreakSource = "opportunity" | "clock_slot" | "export";

export interface BreakPlacement {
  source: BreakSource;
  localOpportunityId: string | null;
  hourIndex: number;
  position: number;
  /** Seconds from the shift's start. */
  offsetSeconds: number;
  /** Seconds from the shift's start by which the network must be rejoined. */
  rejoinOffsetSeconds: number;
  requirement: LogOpportunityRequirement;
  permittedContentTypes: string[];
  /** The export's own printed times for what landed here, for the preview. */
  exportTimes: string[];
}

export interface RundownPlan {
  programId: string;
  programName: string;
  scheduleEntryId: string;
  clockTemplateId: string;
  /** "05:00:00" station-local. */
  shiftStartTime: string;
  shiftDurationMinutes: number;
  breaks: BreakPlan[];
  /**
   * The clock version the breaks were aligned to, or null when they
   * weren't (no version in effect, or an existing rundown that won't be
   * written). The executor re-resolves the version and refuses a mismatch.
   */
  clockVersionId: string | null;
  /** Set when a rundown already exists for this program+date — nothing is written. */
  existingRundownId: string | null;
  existingRundownSource: string | null;
}

export interface UnresolvedEvent {
  time: string;
  description: string;
  reason: string;
}

export interface SkippedNote {
  time: string;
  description: string;
}

export interface ProgramLogPlan {
  airDate: string;
  warnings: string[];
  rundowns: RundownPlan[];
  copyPlans: CopyPlan[];
  unresolved: UnresolvedEvent[];
  notes: SkippedNote[];
}

/**
 * The permitted-content-types snapshot for an imported break that isn't a
 * marked opportunity (an unmarked clock slot, or the export's own window —
 * see program-log-clock-alignment.ts). The export
 * says nothing about what a window permits beyond what actually aired in
 * it, so imported breaks are liberal — any library content type plus the
 * two sentinels — and a host's judgment (plus remaining duration, which the
 * timing engine already enforces) is the real constraint. Matches the full
 * option set clock authoring offers (clock-actions.ts's
 * PERMITTED_CONTENT_TYPE_OPTIONS).
 */
export function importedBreakPermittedTypes(): string[] {
  return [...Object.keys(CONTENT_TYPE_LABEL), "underwriting_credit", "weather"];
}

export const IMPORTED_BREAK_REQUIREMENT: LogOpportunityRequirement = "optional";

const DEFAULT_CREDIT_SECONDS = 30;
const DEFAULT_FILL_SECONDS = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}:\d{2}$/;

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeScript(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * A script as stored: the export's words on one line. The PDF's Description
 * column is narrow, so a script prints wrapped across many visual lines, and
 * the model — told to copy character for character — reproduces those wraps
 * as newlines. They are layout, not content (a DAD script cell carries no
 * paragraph structure), so every whitespace run collapses to one space.
 */
export function cleanScript(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

/**
 * A read-aloud item plans at its estimated read time, not its printed
 * length: the export prints every credit at its booked length (00:30 for a
 * 33-word script and a 69-word one alike), which says nothing about how
 * much of the break the read takes. A recorded spot, or an item with no
 * script, keeps the printed length. The same value becomes a new copy
 * row's duration, and replaces a reused one's when its script changes.
 */
function plannedSeconds<T extends number | null>(
  item: ModelItem,
  script: string | null,
  printedSeconds: T,
): number | T {
  if (item.plays_recording) return printedSeconds;
  return estimateReadSeconds(script) ?? printedSeconds;
}

export interface AssembleInputs {
  output: ProgramLogModelOutput;
  scheduleEntries: PlanScheduleEntry[];
  existingRundowns: PlanExistingRundown[];
  underwriters: PlanUnderwriter[];
  copy: PlanCopy[];
  contentItems: PlanContentItem[];
}

export function assembleProgramLogPlan(inputs: AssembleInputs): ProgramLogPlan {
  const { output } = inputs;
  const warnings: string[] = [];
  const unresolved: UnresolvedEvent[] = output.unresolved.map((row) => ({
    time: row.time,
    description: row.description,
    reason: row.reason,
  }));
  const notes: SkippedNote[] = output.notes.map((row) => ({
    time: row.time,
    description: row.description,
  }));

  const airDate = DATE_RE.test(output.air_date) ? output.air_date : "";
  if (airDate === "")
    warnings.push("The export's air date could not be read, so no rundowns can be created.");

  const entriesById = new Map(inputs.scheduleEntries.map((entry) => [entry.id, entry]));
  const underwriterByName = new Map(
    inputs.underwriters.map((row) => [normalizeName(row.name), row]),
  );
  const copyById = new Map(inputs.copy.map((row) => [row.id, row]));
  const contentById = new Map(inputs.contentItems.map((row) => [row.id, row]));
  const copyPlans: CopyPlan[] = [];
  const copyPlanByKey = new Map<string, CopyPlan>();

  const creditItem = (item: ModelItem, time: string): ItemPlan | null => {
    let underwriterName: string;
    if (item.underwriter === NEW_UNDERWRITER || item.underwriter === null) {
      const newName = item.new_underwriter_name?.trim() ?? "";
      if (newName === "") {
        warnings.push(`A credit at ${time} named no underwriter and was not imported.`);
        return null;
      }
      underwriterName = newName;
    } else {
      underwriterName = item.underwriter;
    }
    const known = underwriterByName.get(normalizeName(underwriterName)) ?? null;
    // A known underwriter's name as stored, so a "NEW" that turns out to
    // already be on file still reuses the row (the SQL find-or-create is
    // keyed on the same name either way).
    if (known) underwriterName = known.name;

    let existing = item.existing_copy_id ? (copyById.get(item.existing_copy_id) ?? null) : null;
    if (
      existing &&
      existing.underwriter_id !== null &&
      known &&
      existing.underwriter_id !== known.id
    ) {
      warnings.push(
        `A credit at ${time} for ${underwriterName} pointed at another underwriter's copy; it will be created as new copy instead.`,
      );
      existing = null;
    } else if (item.existing_copy_id && !existing) {
      warnings.push(
        `A credit at ${time} for ${underwriterName} named copy that isn't in the library; it will be created as new copy.`,
      );
    }

    const script = cleanScript(item.script);
    const label = item.label?.trim() || existing?.label || "Imported copy";
    const cart = item.cart?.trim() || existing?.cart_identifier || null;
    const key = existing
      ? `copy:${existing.id}`
      : `new:${normalizeName(underwriterName)}|${label.toLowerCase()}|${cart ?? ""}`;

    let plan = copyPlanByKey.get(key);
    if (!plan) {
      plan = {
        key,
        underwriterName,
        underwriterIsNew: known === null,
        label,
        cart,
        script: script ?? existing?.script ?? null,
        // Read-aloud copy stores its read-time estimate; the export's
        // printed length is only the booked slot (see plannedSeconds).
        durationSeconds: plannedSeconds(
          item,
          script ?? existing?.script ?? null,
          item.duration_seconds ?? existing?.duration_seconds ?? null,
        ),
        existingCopyId: existing?.id ?? null,
        // Changed wording, or the same words in a library row still
        // carrying layout line breaks from an earlier import — the update
        // is what repairs it.
        scriptChanged:
          existing !== null &&
          script !== null &&
          (normalizeScript(existing.script) !== normalizeScript(script) ||
            existing.script !== cleanScript(existing.script)),
        libraryScript: existing?.script ?? null,
        airings: 0,
      };
      if (!existing && script === null) {
        warnings.push(
          `A credit at ${time} for ${underwriterName} has no script in the export; its copy will be created without one.`,
        );
      }
      copyPlans.push(plan);
      copyPlanByKey.set(key, plan);
    }
    plan.airings += 1;

    return {
      kind: "credit",
      copyKey: key,
      title: cart !== null ? `${underwriterName} / ${label}` : underwriterName,
      durationSeconds: plannedSeconds(
        item,
        plan.script,
        item.duration_seconds ?? plan.durationSeconds ?? DEFAULT_CREDIT_SECONDS,
      ),
    };
  };

  const toItemPlan = (item: ModelItem, time: string): ItemPlan | null => {
    if (item.kind === "credit") return creditItem(item, time);
    const title = item.title?.trim() || "";
    const printedSeconds = item.duration_seconds ?? DEFAULT_FILL_SECONDS;
    if (item.kind === "content") {
      const matched = item.content_item_id ? contentById.get(item.content_item_id) : undefined;
      if (matched)
        return {
          kind: "content",
          contentItemId: matched.id,
          title: matched.title,
          durationSeconds: printedSeconds,
        };
      warnings.push(
        `A fill at ${time} ("${title || "untitled"}") named a library item that isn't in the library; it was kept as a live read instead.`,
      );
    }
    const script = cleanScript(item.script);
    return {
      kind: "live_read",
      title: title || "Live read",
      durationSeconds: plannedSeconds(item, script, printedSeconds),
      script,
    };
  };

  // ---- One rundown per program; a program the model split across two
  // rundowns (it airs twice, or was simply reported in two pieces) merges,
  // since log_rundowns is unique on (program_id, air_date).
  const rundownByProgram = new Map<string, RundownPlan>();
  for (const modelRundown of output.rundowns) {
    const entry = entriesById.get(modelRundown.schedule_entry_id);
    if (!entry) {
      unresolved.push({
        time: modelRundown.breaks[0]?.time ?? "",
        description: modelRundown.program_name,
        reason:
          "No Log schedule entry matches this program on this date, so its rundown can't be created.",
      });
      continue;
    }

    let rundown = rundownByProgram.get(entry.program_id);
    if (!rundown) {
      const existing = inputs.existingRundowns.find((row) => row.program_id === entry.program_id);
      rundown = {
        programId: entry.program_id,
        programName: entry.program_name,
        scheduleEntryId: entry.id,
        clockTemplateId: entry.clock_template_id,
        shiftStartTime: entry.air_time,
        shiftDurationMinutes: entry.duration_minutes,
        breaks: [],
        clockVersionId: null,
        existingRundownId: existing?.id ?? null,
        existingRundownSource: existing?.source ?? null,
      };
      rundownByProgram.set(entry.program_id, rundown);
    } else {
      warnings.push(
        `${entry.program_name} appeared more than once in the log; its breaks were combined into one rundown.`,
      );
    }

    for (const modelBreak of modelRundown.breaks) {
      const time = modelBreak.time.trim();
      if (!TIME_RE.test(time)) {
        unresolved.push({
          time,
          description: modelBreak.label,
          reason: "This break's time isn't in HH:MM:SS form, so it couldn't be placed.",
        });
        continue;
      }
      const items = modelBreak.items
        .map((item) => toItemPlan(item, time))
        .filter((item): item is ItemPlan => item !== null);
      const summed = items.reduce((sum, item) => sum + item.durationSeconds, 0);
      rundown.breaks.push({
        startSeconds: clockTimeToSeconds(time),
        time: secondsToClockTime(clockTimeToSeconds(time)),
        label: modelBreak.label.trim() || "Underwriting break",
        availableDurationSeconds:
          modelBreak.window_seconds ?? (summed > 0 ? summed : DEFAULT_CREDIT_SECONDS),
        items,
      });
    }
  }

  const rundowns = [...rundownByProgram.values()];
  for (const rundown of rundowns) rundown.breaks.sort((a, b) => a.startSeconds - b.startSeconds);
  rundowns.sort(
    (a, b) => clockTimeToSeconds(a.shiftStartTime) - clockTimeToSeconds(b.shiftStartTime),
  );

  return { airDate, warnings, rundowns, copyPlans, unresolved, notes };
}

export function clockTimeToSeconds(time: string): number {
  const [hours = 0, minutes = 0, seconds = 0] = time
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  return hours * 3600 + minutes * 60 + seconds;
}

export function secondsToClockTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}
