// Pure parser for WUWF's DAD/traffic-system daily program log, exported to
// Word — the station's current pre-portal workflow (one .docx per broadcast
// day, a print-layout table of Time | Cart # | Description | Length rows).
// This module takes the docx's word/document.xml as a plain string (the
// caller unzips — see import-actions.ts) and produces classified events; it
// deliberately knows nothing about Supabase or the database, so the row
// classification is unit-testable against a fixture cut from a real export
// (program-log-import.test.ts). Interpreting events against the database —
// which program a row names, which uw_copy a credit matches — is the
// planner's job (program-log-plan.ts), not this file's.
//
// Format realities this parser is built around, all observed in the real
// 2026-08-21 export:
//  - The day is split across several page-tables with repeated title/header
//    rows and a print footer; rows must be stitched across tables in
//    document order.
//  - A credit's live-read script is a separate, time-less row after the
//    credit row — and can land in the *next* page-table when the page
//    breaks between them (Chesser Barr, page 1 → 2 in the reference file).
//  - "UW Credit (mm:ss)" rows are avail markers (the break and its total
//    window), not content. A live read scheduled with no cart at all can
//    print its script *inside the avail marker's own description cell*
//    (the 2026-08-24 export's Alphastar credit) — still an avail, with the
//    trailing text captured as that break's script rather than mistaken
//    for an unrelated content row.
//  - Time-less, length-only rows are DAD's per-avail fill subtotals and
//    carry no information the avail marker doesn't; they are dropped.

export interface ProgramLogEvent {
  /** "06:06:00" — station-local wall clock, as printed. */
  time: string;
  /** Seconds from station-local midnight. */
  timeSeconds: number;
  cart: string | null;
  description: string;
  lengthSeconds: number | null;
  /**
   * Live-read script from the following time-less row(s) — or, on an avail,
   * from trailing text in the marker's own description cell (a cart-less
   * live read printed directly on the avail row).
   */
  script: string | null;
  /**
   * avail  — a "UW Credit (mm:ss)" break marker; availDurationSeconds set.
   * credit — cart + description + a captured script: a scheduled
   *          underwriting credit.
   * note   — an operational reminder ("Take Meter Readings", fader cues);
   *          real, but not content the portal schedules.
   * row    — everything else (program starts, content fills, credits with
   *          no printed script); the planner resolves these against the
   *          database.
   */
  kind: "avail" | "credit" | "note" | "row";
  availDurationSeconds?: number;
}

export interface ParsedProgramLog {
  /** "2026-08-21", from the page title ("Friday 8/21/2026 WUWF-FM Program Log"). */
  airDate: string | null;
  /** "Friday" — as printed, for a sanity cross-check against airDate. */
  weekday: string | null;
  events: ProgramLogEvent[];
  warnings: string[];
}

const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;
const LENGTH_RE = /^\d{2}:\d{2}(?::\d{2})?$/;
const AVAIL_RE = /^UW Credit \((\d{2}:\d{2})\)(?:\s+(\S.*))?$/;
const TITLE_RE = /^(\w+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+WUWF-FM Program Log$/;
const NOTE_RE = /Take Meter Readings|Play .* Fader|COVER spot/i;

/**
 * "06:06:00" → 21960; "01:30" → 90. A two-part value is minutes:seconds
 * (the Length column), a three-part one is hours:minutes:seconds (the Time
 * column) — matching how the DAD printout uses each column.
 */
export function clockToSeconds(value: string): number {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity);
}

/**
 * One table cell's visible text. Paragraphs and explicit line breaks join
 * with a space — a script cell wraps across many runs and breaks, and
 * joining with "" glues the last word of one line to the first of the next.
 */
function cellText(cellXml: string): string {
  const withBreaks = cellXml.replace(/<w:(?:br|cr)\s*\/>/g, " ").replace(/<w:tab\s*\/>/g, " ");
  const paragraphs = withBreaks.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? [withBreaks];
  const texts = paragraphs.map((paragraph) => {
    const runs = paragraph.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [];
    return runs.map((run) => decodeEntities(run.replace(/^<w:t(?:\s[^>]*)?>|<\/w:t>$/g, ""))).join("");
  });
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

interface RawRow {
  cells: string[];
}

/** Every table row's cell texts, in document order across all page-tables. */
function extractRows(documentXml: string): RawRow[] {
  const rows: RawRow[] = [];
  for (const table of documentXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []) {
    for (const row of table.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) ?? []) {
      const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(cellText);
      rows.push({ cells });
    }
  }
  return rows;
}

const WEEKDAY_BY_UTC_DAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function parseProgramLog(documentXml: string): ParsedProgramLog {
  const warnings: string[] = [];
  const events: ProgramLogEvent[] = [];
  let airDate: string | null = null;
  let weekday: string | null = null;

  for (const { cells } of extractRows(documentXml)) {
    const values = cells.filter((cell) => cell !== "");
    if (values.length === 0) continue;
    const joined = values.join(" ");

    const title = TITLE_RE.exec(joined);
    if (title) {
      if (airDate === null) {
        weekday = title[1]!;
        const [month, day, year] = [title[2]!, title[3]!, title[4]!];
        airDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        const printedDay = WEEKDAY_BY_UTC_DAY[new Date(`${airDate}T00:00:00Z`).getUTCDay()];
        if (printedDay !== weekday) {
          warnings.push(
            `The log's printed weekday ("${weekday}") doesn't match its date (${airDate} is a ${printedDay}).`,
          );
        }
      }
      continue;
    }
    if (joined.startsWith("Printed ") || values[0] === "Time") continue;

    const time = values.find((value) => TIME_RE.test(value));
    if (time !== undefined) {
      const rest = values.slice(values.indexOf(time) + 1);
      let cart: string | null = null;
      let cursor = 0;
      if (cursor < rest.length && /^\d+$/.test(rest[cursor]!)) {
        cart = rest[cursor]!;
        cursor += 1;
      }
      const description = rest[cursor] ?? "";
      const trailing = rest[rest.length - 1];
      const lengthSeconds =
        rest.length > cursor + 1 && trailing !== undefined && LENGTH_RE.test(trailing)
          ? clockToSeconds(trailing)
          : null;
      if (description === "") {
        warnings.push(`Row at ${time} has no description and was skipped.`);
        continue;
      }

      const avail = AVAIL_RE.exec(description);
      const event: ProgramLogEvent = {
        time,
        timeSeconds: clockToSeconds(time),
        cart,
        description,
        lengthSeconds,
        // An avail marker's description cell can carry a live-read script
        // after the "(mm:ss)" window (a credit scheduled with no cart) —
        // that trailing text is the break's script, not part of its name.
        script: avail?.[2] !== undefined ? avail[2] : null,
        kind: avail ? "avail" : NOTE_RE.test(description) ? "note" : "row",
      };
      if (avail) event.availDurationSeconds = clockToSeconds(avail[1]!);
      events.push(event);
      continue;
    }

    // Time-less row: either a script continuation for the most recent
    // cart-bearing row (possibly across a page-table boundary), or DAD's
    // per-avail fill subtotal (length-only), which carries nothing new.
    // A bare avail marker with no cart-bearing row after it can also own a
    // script row (a cart-less live read) — whichever of the two is most
    // recent is the owner, so a script never reaches back past its own
    // break to a credit in an earlier one.
    const text = values.filter((value) => !LENGTH_RE.test(value)).join(" ");
    if (text === "") continue;
    const target = [...events]
      .reverse()
      .find((event) => event.kind === "avail" || (event.kind === "row" && event.cart !== null));
    if (target) {
      target.script = target.script === null ? text : `${target.script} ${text}`;
    } else {
      warnings.push(`Text with no owning row was skipped: "${text.slice(0, 80)}"`);
    }
  }

  // Second pass: a cart-bearing row that captured a script is a scheduled
  // underwriting credit. (A cart-bearing row without one — e.g. BirdNote's
  // "cart 33" content row — stays a plain row for the planner to resolve.)
  for (const event of events) {
    if (event.kind === "row" && event.cart !== null && event.script !== null) {
      event.kind = "credit";
    }
  }

  events.sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (events.length === 0) warnings.push("No log rows were found in this document.");
  if (airDate === null) warnings.push("No 'WUWF-FM Program Log' title row was found, so the air date is unknown.");

  return { airDate, weekday, events, warnings };
}
