// The DAD log: the fixed-width traffic file ENCO DAD's ListGen merges into
// a day's playlist, for the breaks in automated hours only — the format
// RadioTraffic's ENCO export wrote, reverse-engineered from a real file
// (fixtures/100126tWUWF.log; the golden test round-trips it byte for byte).
// Pure: building the events, checking them, and writing the file. Loading
// and releasing are lib/log/dad-export-queries.ts and the /log/dad-log
// screen's actions.
//
// One row per item, 183 characters plus CRLF:
//   0–5     DAD cut ("00013A"), blank on a comment row
//   19–26   air time, station-local HH:MM:SS
//   44      event type: P (play) or C (comment)
//   45–75   description, at most 30 characters, padded
//   78–89   12-digit spot number, blank on a comment row
//   142–177 GUID
//   178–182 5-digit sequence number
// File name MMDDYYtWUWF.log. The Portal writes play rows only — no hosted
// hours, no comment rows — and the GUID is the rundown item's id, the key a
// later as-played import matches on.

import type { LogRundownItemKind } from "@/lib/database.types";
import {
  isAutomated,
  stationLocalParts,
  type OnAirChange,
  type WeeklyAutomatedWindow,
} from "./automated-hours";
import { computeItemTimings } from "./timing";

export const DAD_LINE_LENGTH = 183;
export const DAD_DESCRIPTION_LENGTH = 30;

export type DadEventType = "P" | "C";

/** One row of the file. */
export interface DadLogRow {
  cut: string | null;
  /** Station-local "HH:MM:SS". */
  time: string;
  type: DadEventType;
  description: string;
  /** 12 digits; null on a comment row. */
  spotNumber: string | null;
  guid: string;
  sequence: number;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + " ".repeat(width - value.length);
}

/**
 * Text as DAD's plain-ASCII file can carry it: typographic quotes and
 * dashes become their ASCII forms, accents are dropped, anything else that
 * isn't printable ASCII becomes "?".
 */
export function toDadText(value: string): string {
  return value
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

/** One row as its 183 characters. */
export function formatDadRow(row: DadLogRow): string {
  const line =
    pad(row.cut ?? "", 19) +
    pad(row.time, 25) +
    row.type +
    pad(toDadText(row.description).slice(0, DAD_DESCRIPTION_LENGTH), 33) +
    pad(row.spotNumber ?? "", 64) +
    pad(row.guid, 36) +
    String(row.sequence).padStart(5, "0");
  if (line.length !== DAD_LINE_LENGTH) {
    throw new Error(`A DAD log row came out ${line.length} characters, not ${DAD_LINE_LENGTH}.`);
  }
  return line;
}

/** The whole file: every row, each ended by CRLF. */
export function serializeDadLog(rows: DadLogRow[]): string {
  return rows.map((row) => `${formatDadRow(row)}\r\n`).join("");
}

/** Reads a file back into rows — the golden test's other half. */
export function parseDadLog(text: string): DadLogRow[] {
  return text
    .split("\r\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const cut = line.slice(0, 6).trim();
      const spot = line.slice(78, 90).trim();
      return {
        cut: cut === "" ? null : cut,
        time: line.slice(19, 27),
        type: line.slice(44, 45) as DadEventType,
        description: line.slice(45, 76).trimEnd(),
        spotNumber: spot === "" ? null : spot,
        guid: line.slice(142, 178),
        sequence: Number(line.slice(178, 183)),
      };
    });
}

/** "MMDDYYtWUWF.log" for a station-local date. */
export function dadLogFileName(dateISO: string): string {
  return `${dateISO.slice(5, 7)}${dateISO.slice(8, 10)}${dateISO.slice(2, 4)}tWUWF.log`;
}

/** A row's "HH:MM:SS" as the screen reads it: "8:06:18 PM". */
export function formatDadTime(time: string): string {
  const [h = "0", m = "00", sec = "00"] = time.split(":");
  const hour = Number(h);
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m}:${sec} ${hour < 12 ? "AM" : "PM"}`;
}

/** A spot number as DAD prints it: 12 digits. */
export function formatSpotNumber(value: number | string): string {
  return String(value).padStart(12, "0");
}

// ---------------------------------------------------------------------------
// Building the day's events from its rundowns.

export interface DadExportItem {
  id: string;
  position: number;
  kind: LogRundownItemKind;
  durationSeconds: number;
  /** What the description column says: a credit's "copy 1 - Underwriter", a library item's title. */
  description: string;
  /** The DAD cut to play, or null when there is none. */
  cut: string | null;
  /** Minted on first release; null until then. */
  spotNumber: number | null;
  /** Underwriting credits only: whether the copy may air on this date. */
  copyApproved?: boolean;
  copyInDate?: boolean;
  /** Where the fix is: the copy, or the library item. */
  fixHref?: string | null;
}

export interface DadExportBreak {
  id: string;
  rundownId: string;
  programName: string;
  label: string;
  scheduledAt: string;
  availableSeconds: number;
  items: DadExportItem[];
}

export interface DadEvent {
  breakId: string;
  rundownId: string;
  itemId: string;
  programName: string;
  breakLabel: string;
  startAt: string;
  /** Station-local "HH:MM:SS". */
  time: string;
  cut: string | null;
  description: string;
  spotNumber: number | null;
  durationSeconds: number;
}

/** The automated breaks on a station-local date, in air order. */
export function automatedBreaksOn(
  dateISO: string,
  breaks: DadExportBreak[],
  weekly: WeeklyAutomatedWindow[],
  changes: OnAirChange[],
): DadExportBreak[] {
  return breaks
    .filter(
      (brk) =>
        stationLocalParts(brk.scheduledAt).dateISO === dateISO &&
        isAutomated(brk.scheduledAt, weekly, changes),
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

function hhmmss(instantISO: string): string {
  const seconds = stationLocalParts(instantISO).seconds;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

/**
 * Every item in the automated breaks, timed in on-air order within its
 * break (two 30-second credits at 6:06 air at 6:06:00 and 6:06:30), in air
 * order across the day.
 */
export function buildDadEvents(automatedBreaks: DadExportBreak[]): DadEvent[] {
  const events: DadEvent[] = [];
  for (const brk of automatedBreaks) {
    const items = [...brk.items].sort((a, b) => a.position - b.position);
    const timings = computeItemTimings(
      brk.scheduledAt,
      items.map((item) => ({ id: item.id, durationSeconds: item.durationSeconds })),
    );
    items.forEach((item, index) => {
      const startAt = timings[index]!.startAt;
      events.push({
        breakId: brk.id,
        rundownId: brk.rundownId,
        itemId: item.id,
        programName: brk.programName,
        breakLabel: brk.label,
        startAt,
        time: hhmmss(startAt),
        cut: item.cut,
        description: item.description,
        spotNumber: item.spotNumber,
        durationSeconds: item.durationSeconds,
      });
    });
  }
  return events.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** The rows as the screen previews them: an item not yet released has no spot number. */
export function previewRowsFromEvents(events: DadEvent[]): DadLogRow[] {
  return events.map((event, index) => ({
    cut: event.cut,
    time: event.time,
    type: "P",
    description: event.description,
    spotNumber: event.spotNumber === null ? null : formatSpotNumber(event.spotNumber),
    guid: event.itemId,
    sequence: index + 1,
  }));
}

/** The file's rows. Every event must already have a spot number (minted at release). */
export function rowsFromEvents(events: DadEvent[]): DadLogRow[] {
  return events.map((event, index) => {
    if (event.spotNumber === null) {
      throw new Error("Every row needs a spot number before the file is written.");
    }
    return {
      cut: event.cut,
      time: event.time,
      type: "P",
      description: event.description,
      spotNumber: formatSpotNumber(event.spotNumber),
      guid: event.itemId,
      sequence: index + 1,
    };
  });
}

// ---------------------------------------------------------------------------
// What stops a release, and what's only worth knowing.

export type DadIssueSeverity = "blocking" | "warning";

export interface DadIssue {
  severity: DadIssueSeverity;
  code:
    | "no_cut"
    | "host_only"
    | "overrun"
    | "copy_not_approved"
    | "copy_out_of_date"
    | "empty_automated_hours";
  message: string;
  breakId: string | null;
  rundownId: string | null;
  itemId: string | null;
  /** Where to fix it. */
  href: string | null;
}

const HOST_ONLY: Partial<Record<LogRundownItemKind, string>> = {
  live_read: "a live read written for this rundown",
  weather: "the weather",
};

function when(brk: DadExportBreak): string {
  return `${brk.programName}, ${hhmmss(brk.scheduledAt).slice(0, 5)} ${brk.label}`;
}

/**
 * Everything in the automated breaks that DAD couldn't play as planned. A
 * blocking issue stops the release: an item with no cut, something only a
 * host can do, a break that runs past its window, or copy that isn't
 * approved or in date. Warnings don't stop it.
 */
export function validateDadEvents(
  automatedBreaks: DadExportBreak[],
  extraWarnings: DadIssue[] = [],
): DadIssue[] {
  const issues: DadIssue[] = [];
  for (const brk of automatedBreaks) {
    const base = { breakId: brk.id, rundownId: brk.rundownId };
    const rundownHref = `/log/rundowns/${brk.rundownId}`;
    let total = 0;
    for (const item of brk.items) {
      total += item.durationSeconds;
      const hostOnly = HOST_ONLY[item.kind];
      if (hostOnly) {
        issues.push({
          ...base,
          severity: "blocking",
          code: "host_only",
          itemId: item.id,
          message: `${when(brk)}: ${hostOnly} needs a host. Replace it with something recorded.`,
          href: rundownHref,
        });
        continue;
      }
      if (item.cut === null) {
        issues.push({
          ...base,
          severity: "blocking",
          code: "no_cut",
          itemId: item.id,
          message: `${when(brk)}: “${item.description}” has no DAD cut.`,
          href: item.fixHref ?? rundownHref,
        });
      }
      if (item.kind === "underwriting_credit" && item.copyApproved === false) {
        issues.push({
          ...base,
          severity: "blocking",
          code: "copy_not_approved",
          itemId: item.id,
          message: `${when(brk)}: “${item.description}” isn't approved.`,
          href: item.fixHref ?? rundownHref,
        });
      } else if (item.kind === "underwriting_credit" && item.copyInDate === false) {
        issues.push({
          ...base,
          severity: "blocking",
          code: "copy_out_of_date",
          itemId: item.id,
          message: `${when(brk)}: “${item.description}” is outside its dates.`,
          href: item.fixHref ?? rundownHref,
        });
      }
    }
    if (total > brk.availableSeconds) {
      issues.push({
        ...base,
        severity: "blocking",
        code: "overrun",
        itemId: null,
        message: `${when(brk)} runs ${total - brk.availableSeconds} seconds past its window.`,
        href: rundownHref,
      });
    }
  }
  return [...issues, ...extraWarnings];
}

export function hasBlockingIssues(issues: DadIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocking");
}
