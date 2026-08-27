// Pure import planner — turns a parsed DAD program-log export
// (program-log-import.ts) plus the database's current state (programs,
// schedule entries, existing rundowns, underwriters/copy, the content
// library — all supplied by the caller, this module never touches
// Supabase) into an explicit plan: which rundowns to create with which
// breaks and items, which underwriting copy to reuse versus create, and
// what couldn't be resolved. The preview screen renders the plan verbatim
// and the executor (import-actions.ts) applies it — one computation drives
// both, never two (the same discipline Underwriting's auto-fill
// provisioning follows).

import type { LogOpportunityRequirement } from "@/lib/database.types";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import { isScheduleEntryActiveOn, type ScheduleEntryLike } from "@/lib/log/schedule";
import type { ParsedProgramLog, ProgramLogEvent } from "@/lib/log/program-log-import";

export interface PlanProgram {
  id: string;
  name: string;
}

export interface PlanScheduleEntry extends ScheduleEntryLike {
  id: string;
  program_id: string;
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
}

export interface ProgramLogPlanInputs {
  parsed: ParsedProgramLog;
  programs: PlanProgram[];
  scheduleEntries: PlanScheduleEntry[];
  existingRundowns: PlanExistingRundown[];
  underwriters: PlanUnderwriter[];
  copy: PlanCopy[];
  contentItems: PlanContentItem[];
}

/** One distinct credit across the day (the same copy often airs several times). */
export interface CopyPlan {
  /** Stable key item plans reference: `${cart ?? ""}|${description}`. */
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
  /** Matched an existing copy whose stored script text differs. */
  scriptChanged: boolean;
  airings: number;
}

export type ItemPlan =
  | { kind: "credit"; copyKey: string; title: string; durationSeconds: number }
  | { kind: "content"; contentItemId: string; title: string; durationSeconds: number }
  | { kind: "live_read"; title: string; durationSeconds: number; script: string | null };

export interface BreakPlan {
  /** Seconds from station-local midnight. */
  startSeconds: number;
  /** "06:06:00" — for display and for the executor's timestamp conversion. */
  time: string;
  label: string;
  availableDurationSeconds: number;
  items: ItemPlan[];
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
 * The permitted-content-types snapshot for an imported break. The export
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

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeScript(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Matches a log row's description to a program: exact normalized equality,
 * or containment either way when the shorter side is long enough that
 * containment is meaningful ("Marketplace PM - Play through ENCO Programs
 * Fader" names Marketplace PM; a two-letter program like "1A" only ever
 * matches exactly).
 */
export function matchProgram(description: string, programs: PlanProgram[]): PlanProgram | null {
  const target = normalizeName(description);
  if (target === "") return null;
  let best: PlanProgram | null = null;
  let bestLength = 0;
  for (const program of programs) {
    const name = normalizeName(program.name);
    if (name === "") continue;
    const exact = name === target;
    const contained =
      Math.min(name.length, target.length) >= 4 && (target.includes(name) || name.includes(target));
    if ((exact || contained) && name.length > bestLength) {
      best = program;
      bestLength = name.length;
    }
  }
  return best;
}

/** "Baptist Healthcare / Copy 1" → underwriter "Baptist Healthcare", label "Copy 1". */
export function splitCreditDescription(description: string): { underwriterName: string; label: string } {
  const separator = description.lastIndexOf(" / ");
  if (separator === -1) return { underwriterName: description.trim(), label: "Imported copy" };
  return {
    underwriterName: description.slice(0, separator).trim(),
    label: description.slice(separator + 3).trim() || "Imported copy",
  };
}

interface CreditEventLike {
  cart: string | null;
  description: string;
  script: string | null;
  lengthSeconds: number | null;
}

function copyPlanKey(event: CreditEventLike): string {
  return `${event.cart ?? ""}|${event.description}`;
}

/**
 * Matches one export credit against existing copy: same cart (or both
 * cart-less) and same label, case-insensitively — the identity
 * log_import_underwriting_copy() also keys its find-or-create on — with an
 * underwriter-name check when the candidate carries a direct attribution.
 * A match whose stored script text differs is still a match (the station's
 * export is not the place copy gets edited from), flagged so the preview
 * can surface it.
 */
export function matchCopy(
  event: CreditEventLike,
  copy: PlanCopy[],
  underwritersById: Map<string, PlanUnderwriter>,
): { match: PlanCopy | null; scriptChanged: boolean } {
  const { underwriterName, label } = splitCreditDescription(event.description);
  const cart = event.cart;
  const candidates = copy.filter((row) => {
    if ((row.cart_identifier ?? null) !== cart) return false;
    if (row.label.toLowerCase() !== label.toLowerCase()) return false;
    if (row.underwriter_id !== null) {
      const attributed = underwritersById.get(row.underwriter_id);
      if (attributed && normalizeName(attributed.name) !== normalizeName(underwriterName)) return false;
    }
    return true;
  });
  const match = candidates[0] ?? null;
  const scriptChanged =
    match !== null &&
    normalizeScript(match.script) !== "" &&
    normalizeScript(event.script) !== "" &&
    normalizeScript(match.script) !== normalizeScript(event.script);
  return { match, scriptChanged };
}

/**
 * Matches a non-credit fill row ("Birdnote Daily -Located in the Eco group
 * DAD") to a library content item by normalized title containment — the
 * library's own title must be reasonably long, and the longest matching
 * title wins. No match is a normal outcome: the row becomes a live_read
 * item carrying its printed description, never an auto-created library row.
 */
export function matchContentItem(description: string, items: PlanContentItem[]): PlanContentItem | null {
  const target = normalizeName(description);
  let best: PlanContentItem | null = null;
  let bestLength = 0;
  for (const item of items) {
    const title = normalizeName(item.title);
    if (title.length < 4) continue;
    if ((target === title || target.includes(title) || title.includes(target)) && title.length > bestLength) {
      best = item;
      bestLength = title.length;
    }
  }
  return best;
}

const DEFAULT_CREDIT_SECONDS = 30;
const DEFAULT_FILL_SECONDS = 60;
/** A row at least this long reads as a program start wherever it falls. */
const PROBABLE_PROGRAM_MIN_SECONDS = 1500;
/** How far into an hour a "00:00"-length row still reads as a program start. */
const PROGRAM_START_HOUR_WINDOW_SECONDS = 120;

/**
 * Whether an *unmatched* row looks like a program start (a matched program
 * name always wins regardless of shape). DAD prints "00:00" both for a
 * program that runs to fill AND for short mid-hour features (the real
 * export's "Sound Beat" at 10:38:30) — so a 00:00 row only reads as a
 * program start near the top of an hour; mid-hour it's a fill, which keeps
 * the rest of the hour attached to the program actually airing.
 */
function isProbableProgramRow(event: ProgramLogEvent): boolean {
  if ((event.lengthSeconds ?? 0) >= PROBABLE_PROGRAM_MIN_SECONDS) return true;
  return event.lengthSeconds === 0 && event.timeSeconds % 3600 < PROGRAM_START_HOUR_WINDOW_SECONDS;
}

interface Segment {
  program: PlanProgram | null;
  startSeconds: number;
  events: ProgramLogEvent[];
}

export function buildProgramLogPlan(inputs: ProgramLogPlanInputs): ProgramLogPlan {
  const { parsed } = inputs;
  const warnings = [...parsed.warnings];
  const unresolved: UnresolvedEvent[] = [];
  const notes: SkippedNote[] = [];
  const airDate = parsed.airDate ?? "";
  if (airDate === "") warnings.push("The export names no air date, so no rundowns can be created.");

  const underwritersById = new Map(inputs.underwriters.map((row) => [row.id, row]));
  const underwriterNames = new Set(inputs.underwriters.map((row) => normalizeName(row.name)));

  // ---- Segment the day by program-start rows --------------------------------
  const segments: Segment[] = [];
  let current: Segment | null = null;
  for (const event of parsed.events) {
    if (event.kind === "note") {
      notes.push({ time: event.time, description: event.description });
      continue;
    }
    if (event.kind === "row") {
      const program = matchProgram(event.description, inputs.programs);
      if (program) {
        current = { program, startSeconds: event.timeSeconds, events: [] };
        segments.push(current);
        continue;
      }
      if (isProbableProgramRow(event)) {
        unresolved.push({
          time: event.time,
          description: event.description,
          reason: "Looks like a program start, but no Log program matches this name.",
        });
        current = { program: null, startSeconds: event.timeSeconds, events: [] };
        segments.push(current);
        continue;
      }
    }
    if (current === null) {
      unresolved.push({
        time: event.time,
        description: event.description,
        reason: "Appears before the first recognizable program start.",
      });
      continue;
    }
    if (current.program === null) {
      unresolved.push({
        time: event.time,
        description: event.description,
        reason: "Falls under an unrecognized program.",
      });
      continue;
    }
    current.events.push(event);
  }

  // ---- Distinct credits across the day --------------------------------------
  const copyPlansByKey = new Map<string, CopyPlan>();
  for (const segment of segments) {
    for (const event of segment.events) {
      if (event.kind !== "credit") continue;
      const key = copyPlanKey(event);
      const existing = copyPlansByKey.get(key);
      if (existing) {
        existing.airings += 1;
        continue;
      }
      const { underwriterName, label } = splitCreditDescription(event.description);
      const { match, scriptChanged } = matchCopy(event, inputs.copy, underwritersById);
      copyPlansByKey.set(key, {
        key,
        underwriterName,
        underwriterIsNew: match === null && !underwriterNames.has(normalizeName(underwriterName)),
        label,
        cart: event.cart,
        script: event.script,
        durationSeconds: event.lengthSeconds,
        existingCopyId: match?.id ?? null,
        scriptChanged,
        airings: 1,
      });
    }
  }

  // ---- One rundown plan per program -----------------------------------------
  const segmentsByProgram = new Map<string, Segment[]>();
  for (const segment of segments) {
    if (segment.program === null) continue;
    const group = segmentsByProgram.get(segment.program.id);
    if (group) group.push(segment);
    else segmentsByProgram.set(segment.program.id, [segment]);
  }

  const rundowns: RundownPlan[] = [];
  for (const [programId, group] of segmentsByProgram) {
    const program = group[0]!.program!;
    const events = group.flatMap((segment) => segment.events);
    const observedStart = Math.min(...group.map((segment) => segment.startSeconds));

    // The schedule entry active on this date whose air time sits closest to
    // where the export actually starts this program.
    const activeEntries = inputs.scheduleEntries.filter(
      (entry) => entry.program_id === programId && airDate !== "" && isScheduleEntryActiveOn(entry, airDate),
    );
    const entry = activeEntries
      .map((candidate) => ({
        candidate,
        distance: Math.abs(clockTimeToSeconds(candidate.air_time) - observedStart),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    if (!entry) {
      for (const segment of group) {
        unresolved.push({
          time: secondsToClockTime(segment.startSeconds),
          description: program.name,
          reason: "No Log schedule entry covers this program on this date, so its rundown can't be created.",
        });
      }
      continue;
    }

    const breaks = buildBreaks(events, inputs.contentItems, unresolved);
    const existing = inputs.existingRundowns.find((rundown) => rundown.program_id === programId);
    rundowns.push({
      programId,
      programName: program.name,
      scheduleEntryId: entry.id,
      clockTemplateId: entry.clock_template_id,
      shiftStartTime: entry.air_time,
      shiftDurationMinutes: entry.duration_minutes,
      breaks,
      existingRundownId: existing?.id ?? null,
      existingRundownSource: existing?.source ?? null,
    });
  }
  rundowns.sort((a, b) => clockTimeToSeconds(a.shiftStartTime) - clockTimeToSeconds(b.shiftStartTime));

  return {
    airDate,
    warnings,
    rundowns,
    copyPlans: [...copyPlansByKey.values()],
    unresolved,
    notes,
  };
}

function buildBreaks(
  events: ProgramLogEvent[],
  contentItems: PlanContentItem[],
  unresolved: UnresolvedEvent[],
): BreakPlan[] {
  const breaks: BreakPlan[] = [];
  let open: BreakPlan | null = null;

  const openEndSeconds = (): number =>
    open === null ? Number.NEGATIVE_INFINITY : open.startSeconds + open.availableDurationSeconds;

  for (const event of events) {
    if (event.kind === "avail") {
      open = {
        startSeconds: event.timeSeconds,
        time: event.time,
        label: "Underwriting break",
        availableDurationSeconds: event.availDurationSeconds ?? DEFAULT_CREDIT_SECONDS,
        items: [],
      };
      breaks.push(open);
      // A cart-less live-read credit prints its script directly on (or
      // right after) the avail marker itself, with no credit row of its
      // own — that script is this break's content, as a live read.
      // extraLiveReadScripts (see program-log-import.ts's ProgramLogEvent
      // doc comment) holds any further credits credit-script-splitter.ts
      // verified were bundled into the same script with no separating
      // marker — each becomes its own live_read item in this same break,
      // never merged back into one.
      if (event.script !== null) {
        const extraScripts = event.extraLiveReadScripts ?? [];
        const totalCredits = 1 + extraScripts.length;
        const titleFor = (position: number) =>
          totalCredits > 1 ? `Underwriting live read (${position} of ${totalCredits})` : "Underwriting live read";
        open.items.push({
          kind: "live_read",
          title: titleFor(1),
          durationSeconds: DEFAULT_CREDIT_SECONDS,
          script: event.script,
        });
        extraScripts.forEach((script, index) => {
          open!.items.push({
            kind: "live_read",
            title: titleFor(index + 2),
            durationSeconds: DEFAULT_CREDIT_SECONDS,
            script,
          });
        });
      }
      continue;
    }

    const itemPlan = toItemPlan(event, contentItems);
    if (itemPlan === null) {
      unresolved.push({
        time: event.time,
        description: event.description,
        reason: "Couldn't be turned into a rundown item.",
      });
      continue;
    }
    if (open !== null && event.timeSeconds <= openEndSeconds()) {
      open.items.push(itemPlan);
      continue;
    }
    // A fill with no covering avail (Unearthing Florida, BirdNote) is its
    // own window in the real log — it becomes its own break.
    open = {
      startSeconds: event.timeSeconds,
      time: event.time,
      label: event.description,
      availableDurationSeconds: itemPlan.durationSeconds,
      items: [itemPlan],
    };
    breaks.push(open);
  }
  return breaks;
}

function toItemPlan(event: ProgramLogEvent, contentItems: PlanContentItem[]): ItemPlan | null {
  if (event.kind === "credit") {
    return {
      kind: "credit",
      copyKey: copyPlanKey(event),
      title: event.description,
      durationSeconds: event.lengthSeconds || DEFAULT_CREDIT_SECONDS,
    };
  }
  if (event.kind !== "row") return null;
  const matched = matchContentItem(event.description, contentItems);
  const durationSeconds = event.lengthSeconds || DEFAULT_FILL_SECONDS;
  if (matched) {
    return { kind: "content", contentItemId: matched.id, title: matched.title, durationSeconds };
  }
  return { kind: "live_read", title: event.description, durationSeconds, script: event.script };
}

export function clockTimeToSeconds(time: string): number {
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map((part) => Number.parseInt(part, 10));
  return hours * 3600 + minutes * 60 + seconds;
}

export function secondsToClockTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}
