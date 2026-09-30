// Seeding active copy from RadioTraffic (docs/underwriting-traffic-redesign.md
// §15). Pure — no Supabase import, colocated tests. The screen at
// /underwriting/migration/copy runs this in the browser for the review and
// the import action runs it again on the server against a fresh snapshot, so
// the review is a courtesy and this plan, recomputed, is the boundary.
//
// The export is authoritative for the copy itself (underwriter, label, cart,
// script, dates). Everything that ties a row to the portal is deterministic:
// an underwriter is matched by normalised name or an explicit alias, a
// message by its script, a contract by dates and product, a flight by name.
// Where more than one answer fits, the plan asks a question instead of
// guessing, and a row waiting on an answer is left out of the import.

import { parseCsv } from "./agreement-migration";
import { estimateReadSeconds } from "@/lib/log/read-time";
import { formatDateRange } from "./line-details";
import { shortDate } from "./dates";
import { orderNumberLabel } from "./contract-label";
import type {
  UwContractStatus,
  UwCopyApprovalStatus,
  UwCopyExecutionKind,
  UwFlightStatus,
} from "@/lib/database.types";

// ---- The export ------------------------------------------------------------

export interface LegacyCopyRow {
  /** The spreadsheet's own row number (1-based, counting title lines), for messages. */
  row: number;
  underwriter: string;
  label: string;
  cart: string | null;
  lengthSeconds: number | null;
  startDate: string | null;
  endDate: string | null;
  /** Verbatim, apart from line endings and surrounding whitespace. */
  script: string;
}

export interface LegacyCopyError {
  row: number | null;
  message: string;
}

export interface ParsedLegacyCopy {
  rows: LegacyCopyRow[];
  errors: LegacyCopyError[];
}

type Field = "underwriter" | "label" | "cart" | "length" | "start" | "end" | "script";

const HEADER_ALIASES: Record<Field, string[]> = {
  underwriter: ["underwriter", "underwritername", "sponsor", "client", "advertiser", "account"],
  label: ["copyname", "copy", "label", "copylabel", "name", "title"],
  cart: ["cart", "cartnumber", "cartno", "cartnum", "cut"],
  length: ["lengthsec", "length", "lengthseconds", "duration", "durationseconds", "seconds", "len"],
  start: ["startdate", "start", "effectivefrom", "from", "begins"],
  end: ["enddate", "end", "effectiveto", "to", "expires", "expiration"],
  script: ["script", "copytext", "text", "body"],
};

function headerKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** yyyy-mm-dd from m/d/yyyy (what Excel's "Save as CSV" writes), m/d/yy, or ISO; null when blank; undefined when unreadable. */
export function parseSourceDate(value: string): string | null | undefined {
  const text = value.trim();
  if (text === "") return null;
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s.*)?$/.exec(text);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (us) {
    [month, day, year] = [Number(us[1]), Number(us[2]), Number(us[3])];
    if (year < 100) year += 2000;
  } else {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return undefined;
  return date.toISOString().slice(0, 10);
}

/** Whole seconds from "30", "30.0", "0:30" or "00:00:30"; null when blank; undefined when unreadable. */
export function parseSourceLength(value: string): number | null | undefined {
  const text = value.trim();
  if (text === "") return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  const parts = text.split(":");
  if (parts.length >= 2 && parts.length <= 3 && parts.every((part) => /^\d+$/.test(part)))
    return parts.reduce((total, part) => total * 60 + Number(part), 0);
  return undefined;
}

export const MAX_LEGACY_COPY_ROWS = 2000;

/**
 * Reads the export after "Save as CSV". Title lines above the header are
 * skipped: the header is the first row naming both an underwriter and a
 * script column. Columns are found by name, so their order doesn't matter.
 */
export function parseLegacyCopyCsv(text: string): ParsedLegacyCopy {
  const table = parseCsv(text);
  const headerIndex = table.findIndex((cells) => {
    const keys = cells.map(headerKey);
    return (
      HEADER_ALIASES.underwriter.some((alias) => keys.includes(alias)) &&
      HEADER_ALIASES.script.some((alias) => keys.includes(alias))
    );
  });
  if (headerIndex === -1)
    return {
      rows: [],
      errors: [{ row: null, message: "No header row with an Underwriter and a Script column." }],
    };

  const keys = table[headerIndex]!.map(headerKey);
  const column = {} as Record<Field, number>;
  for (const field of Object.keys(HEADER_ALIASES) as Field[])
    column[field] =
      HEADER_ALIASES[field].map((alias) => keys.indexOf(alias)).find((index) => index !== -1) ?? -1;
  if (column.label === -1)
    return { rows: [], errors: [{ row: null, message: "No Copy Name (or Label) column." }] };

  const rows: LegacyCopyRow[] = [];
  const errors: LegacyCopyError[] = [];
  const body = table.slice(headerIndex + 1);
  if (body.length > MAX_LEGACY_COPY_ROWS)
    errors.push({ row: null, message: `Only the first ${MAX_LEGACY_COPY_ROWS} rows are read.` });

  body.slice(0, MAX_LEGACY_COPY_ROWS).forEach((cells, offset) => {
    const row = headerIndex + offset + 2;
    const cell = (field: Field) => (column[field] === -1 ? "" : (cells[column[field]] ?? ""));
    const underwriter = cell("underwriter").trim();
    const label = cell("label").trim();
    const script = cell("script").replace(/\r\n?/g, "\n").trim();
    if (underwriter === "" && label === "" && script === "") return;
    if (underwriter === "") return errors.push({ row, message: "No underwriter." });
    if (label === "") return errors.push({ row, message: `${underwriter}: no copy name.` });

    const lengthSeconds = parseSourceLength(cell("length"));
    const startDate = parseSourceDate(cell("start"));
    const endDate = parseSourceDate(cell("end"));
    if (lengthSeconds === undefined)
      return errors.push({
        row,
        message: `${underwriter} / ${label}: unreadable length "${cell("length")}".`,
      });
    if (startDate === undefined || endDate === undefined)
      return errors.push({ row, message: `${underwriter} / ${label}: unreadable date.` });
    if (startDate && endDate && endDate < startDate)
      return errors.push({ row, message: `${underwriter} / ${label}: ends before it starts.` });

    const cart = cell("cart").trim();
    rows.push({
      row,
      underwriter,
      label,
      cart: cart === "" ? null : cart,
      lengthSeconds,
      startDate,
      endDate,
      script,
    });
  });
  return { rows, errors };
}

// ---- What a row is --------------------------------------------------------

/** RadioTraffic's stand-in for an event whose script hasn't been entered ("... copy holder ...."). */
export function isPlaceholderScript(script: string): boolean {
  return script.trim() === "" || /^[\s.…]*copy\s*holder[\s.…]*$/i.test(script);
}

/**
 * A row that isn't underwriting copy at all: an EAS test procedure, or a
 * script that is only a bracketed editorial note (the export replaces
 * anything sensitive with one). A "WUWF Event" row with a real credit
 * script is copy and goes through the ordinary path.
 */
export function isNotUnderwritingCopy(row: Pick<LegacyCopyRow, "label" | "script">): boolean {
  if (/\bEAS\b|emergency alert/i.test(row.label)) return true;
  return /^\[[^\]]*\]$/.test(row.script.trim());
}

/**
 * True when the script is an instruction to play a recorded spot ("Please
 * play the #___ spot for…", "Please the play "TLC spot ___"") rather than
 * words a host reads — the same distinction the program-log import's
 * plays_recording draws. A credit read first and then a segment played
 * ("Please read credit first, then play the segment") is still a live read.
 */
export function playsRecording(script: string): boolean {
  return /\bplease\s+(?:the\s+)?play\b/i.test(script);
}

/**
 * RadioTraffic numbers every piece of copy with a "cart", including live
 * reads, and reuses a number across messages (every Day Sponsor is 300), so
 * a cart is a reference, never what decides how the copy airs. The script
 * decides: a recorded spot's length is the audio's (the export's length); a
 * read's is the read-time estimate, as the Log importer and copy form store.
 */
export function copyExecution(row: Pick<LegacyCopyRow, "script" | "lengthSeconds">): {
  executionKind: UwCopyExecutionKind;
  durationSeconds: number | null;
} {
  if (playsRecording(row.script))
    return { executionKind: "recorded", durationSeconds: row.lengthSeconds };
  return { executionKind: "live_read", durationSeconds: estimateReadSeconds(row.script) };
}

// ---- Normalising for comparison ---------------------------------------------

const APOSTROPHES = /[‘’‛′ʼ`´']/g;

/** An underwriter name reduced to what identifies it: case, punctuation, "&"/"and", and plurals aside. */
export function underwriterKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "")
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word,
    )
    .join(" ");
}

/**
 * RadioTraffic names the portal knows under another name. Keyed by
 * underwriterKey(); the value is the portal's name, matched the same way.
 * Add a line here, not a heuristic, when an export spells a sponsor
 * differently and the review's "It's an underwriter on file" would
 * otherwise be answered every time.
 */
export const UNDERWRITER_ALIASES: Record<string, string> = {
  [underwriterKey("FPM - FL Power & Light")]: "Florida Power & Light",
  [underwriterKey("FPM - FPL")]: "Florida Power & Light",
  [underwriterKey("FPM - FPREN")]: "Florida Public Radio Emergency Network",
  [underwriterKey("FPM - Window World")]: "Window World of Pensacola",
  [underwriterKey("Pensacola Pop Comics")]: "P'cola Pop Comics",
  [underwriterKey("Chesser & Barr")]: "Chesser Barr Law Firm",
  [underwriterKey("Chesser and Barr Law Firm")]: "Chesser Barr Law Firm",
};

/** Station underwriters the migration may add without asking — copy the station runs for itself, never a sponsor. */
export const STATION_UNDERWRITERS = ["WUWF Day Sponsor"];

/**
 * A script reduced to its words: typographic quotes, dashes and ellipses
 * made plain, whitespace collapsed, case ignored. Two scripts with the same
 * key are the same message (the Log importer stores "Bud & Alley’s" where
 * RadioTraffic prints "Bud & Alley's").
 */
export function scriptKey(script: string): string {
  return script
    .normalize("NFKC")
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/…/g, "...")
    .replace(/\s*[-‐‑‒–—―−]+\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function labelKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

function cartKey(cart: string | null): string {
  const trimmed = (cart ?? "").trim().toLowerCase();
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed;
}

/** "Copy 2" before "Copy 10": the order new copy is created in, which is the rotation's cycle order. */
export function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

// ---- Comparing two versions of a script ---------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return previous[b.length]!;
}

export type ScriptDifference =
  /** The portal filled in a blank RadioTraffic still prints ("# 2" for "#________"): the portal's is the better copy. */
  | "filled_in"
  /** A few characters apart — usually words the old program-log import glued together: RadioTraffic's is the better copy. */
  | "correction"
  /** A different message that reuses the name and cart (RadioTraffic's monthly rotations). */
  | "different";

export function classifyScriptDifference(portal: string, incoming: string): ScriptDifference {
  if (/_{2,}/.test(incoming) && !/_{2,}/.test(portal)) return "filled_in";
  const a = scriptKey(portal).replace(/[^a-z0-9]/g, "");
  const b = scriptKey(incoming).replace(/[^a-z0-9]/g, "");
  const allowed = Math.max(3, Math.ceil(Math.max(a.length, b.length) * 0.01));
  if (Math.abs(a.length - b.length) > allowed) return "different";
  return levenshtein(a, b) <= allowed ? "correction" : "different";
}

// ---- Products -------------------------------------------------------------

type Product = "learning_minute" | "radiolive" | "book_club";

const PRODUCTS: { product: Product; pattern: RegExp; name: string }[] = [
  { product: "learning_minute", pattern: /learning\s*minute/i, name: "Learning Minute" },
  { product: "radiolive", pattern: /radio\s*live/i, name: "RadioLive" },
  { product: "book_club", pattern: /book\s*club/i, name: "Book Club" },
];

/** A contract sold for the app or the web, never for air. Broadcast copy is never linked to one automatically. */
export function isDigitalOnlyContract(category: string | null): boolean {
  return /\b(app|apps|digital|web|website|online|banner|newsletter|social)\b/i.test(category ?? "");
}

function productIn(text: string): Product | null {
  return PRODUCTS.find((entry) => entry.pattern.test(text))?.product ?? null;
}

/**
 * The product a piece of copy is for, when it names one where a product
 * would be named: its copy name, its opening words ("TLC Learning Minute…",
 * "The WUWF Book Club invites…"), or a recorded-spot instruction's tag
 * ("…archives of Learning Minute messages"). A sponsor's credit that only
 * mentions a book club in passing is not Book Club copy.
 */
export function copyProduct(row: Pick<LegacyCopyRow, "label" | "script">): Product | null {
  return (
    productIn(row.label) ??
    productIn(row.script.slice(0, 60)) ??
    (playsRecording(row.script) ? productIn(row.script) : null)
  );
}

function productName(product: Product): string {
  return PRODUCTS.find((entry) => entry.product === product)!.name;
}

// ---- What's on file --------------------------------------------------------

export interface SnapshotUnderwriter {
  id: string;
  name: string;
}

export interface SnapshotCopy {
  id: string;
  underwriter_id: string | null;
  label: string;
  cart_identifier: string | null;
  script: string | null;
  execution_kind: UwCopyExecutionKind;
  duration_seconds: number | null;
  effective_from: string;
  effective_to: string | null;
  approval_status: UwCopyApprovalStatus;
  created_at: string;
}

export interface SnapshotContract {
  id: string;
  underwriter_id: string;
  contract_identifier: string | null;
  sponsorship_category: string | null;
  status: UwContractStatus;
  effective_from: string;
  effective_to: string | null;
}

export interface SnapshotFlight {
  id: string;
  contract_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: UwFlightStatus;
}

export interface SnapshotLink {
  contract_id: string;
  copy_id: string;
  flight_id: string | null;
  schedule_line_id?: string | null;
}

/** A contract's schedule line on its current revision — what a message can be dedicated to. */
export interface SnapshotLine {
  id: string;
  contract_id: string;
  label: string;
  /** The inventory pool's name ("Carpool"), when the line sells one. */
  pool_name: string | null;
}

export interface LegacyCopySnapshot {
  underwriters: SnapshotUnderwriter[];
  copy: SnapshotCopy[];
  contracts: SnapshotContract[];
  flights: SnapshotFlight[];
  links: SnapshotLink[];
  /** Active lines of each contract's current revision; optional so an older caller plans without line scoping. */
  lines?: SnapshotLine[];
}

// ---- Questions and answers ---------------------------------------------------

export interface QuestionOption {
  value: string;
  label: string;
  hint: string;
}

export type LegacyCopyQuestionKind = "underwriter" | "contract" | "flight" | "script";

export interface ScriptComparison {
  label: string;
  portal: string;
  incoming: string;
  incomingDates: string;
}

export interface LegacyCopyQuestion {
  key: string;
  kind: LegacyCopyQuestionKind;
  /** Who the question is about, as the card's short title. */
  subject: string;
  question: string;
  context: string;
  options: QuestionOption[];
  /** The option to preselect when it is the safe choice; the person still confirms it. */
  recommended: string | null;
  /** How many export rows wait on the answer. */
  rowCount: number;
  /** For kind "script": each copy the answer covers, portal wording beside RadioTraffic's. */
  comparisons?: ScriptComparison[];
  /** For kind "underwriter": offer a picker of every underwriter on file. */
  choosesUnderwriter?: boolean;
}

/** question key → the chosen option's value (an underwriter answer may be `id:<uuid>`). */
export type LegacyCopyAnswers = Record<string, string>;

export const SKIP = "skip";
export const NEW_UNDERWRITER = "new";
export const NO_CONTRACT = "none";
export const EVERY_CONTRACT = "all";
export const WHOLE_CONTRACT = "whole";
export const NEW_COPY = "new";
export const KEEP_PORTAL = "keep";
export const USE_INCOMING = "replace";

// ---- The plan ---------------------------------------------------------------

export type ExcludedReason = "placeholder" | "not_copy" | "skipped";

export interface PlannedLink {
  contractId: string;
  contractLabel: string;
  flightId: string | null;
  flightName: string | null;
  /** The one line this message is dedicated to on the contract (§16), or null for every line. */
  scheduleLineId: string | null;
  scheduleLineLabel: string | null;
  /** Already linked: nothing to write. */
  exists: boolean;
}

/** Fields the import writes onto copy already in the portal — each one listed in the review. */
export interface CopyUpdates {
  effective_from?: string;
  effective_to?: string | null;
  cart_identifier?: string;
  script?: string;
  duration_seconds?: number | null;
}

export type LegacyCopyStatus = "ready" | "done" | "waiting" | "excluded";

export interface PlannedCopy {
  /** Stable within one export: the first source row's number. */
  key: string;
  rows: number[];
  sourceUnderwriter: string;
  underwriter:
    | { kind: "matched"; id: string; name: string; viaAlias: boolean }
    | { kind: "create"; name: string }
    | { kind: "unresolved" };
  label: string;
  cart: string | null;
  script: string;
  startDate: string | null;
  endDate: string | null;
  sourceLengthSeconds: number | null;
  executionKind: UwCopyExecutionKind;
  durationSeconds: number | null;
  copy:
    | { action: "create" }
    | {
        action: "reuse";
        id: string;
        label: string;
        cart: string | null;
        updates: CopyUpdates;
        /** Plain-language list of `updates`, for the review. */
        changes: string[];
      }
    | { action: "none" };
  links: PlannedLink[];
  /** Why the copy stays with the underwriter only, when it does. */
  unlinkedReason: string | null;
  status: LegacyCopyStatus;
  waitingOn: string[];
  excludedReason: ExcludedReason | null;
  notes: string[];
}

export interface LegacyCopyPlan {
  copies: PlannedCopy[];
  questions: LegacyCopyQuestion[];
  /** Underwriter names the import will add. */
  newUnderwriters: string[];
  counts: {
    rows: number;
    ready: number;
    done: number;
    waiting: number;
    excluded: number;
    placeholders: number;
    notCopy: number;
    skipped: number;
    create: number;
    reuse: number;
    updated: number;
    linksToCreate: number;
    underwriterOnly: number;
  };
}

function overlaps(
  aFrom: string | null,
  aTo: string | null,
  bFrom: string | null,
  bTo: string | null,
): boolean {
  return (
    (aFrom ?? "0000-00-00") <= (bTo ?? "9999-12-31") &&
    (bFrom ?? "0000-00-00") <= (aTo ?? "9999-12-31")
  );
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatSourceDates(startDate: string | null, endDate: string | null): string {
  if (startDate === null)
    return endDate === null ? "no dates" : `until ${shortDate(endDate)}, ${endDate.slice(0, 4)}`;
  if (endDate === startDate) return `${shortDate(startDate)}, ${startDate.slice(0, 4)}`;
  return formatDateRange(startDate, endDate);
}

export function contractLabel(contract: SnapshotContract): string {
  const parts = [orderNumberLabel(contract.contract_identifier)];
  if (contract.sponsorship_category) parts.push(contract.sponsorship_category);
  parts.push(formatDateRange(contract.effective_from, contract.effective_to));
  if (contract.status !== "active") parts.push(contract.status);
  return parts.join(" · ");
}

function nameTokens(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "" && word !== "the");
}

/** A copy name naming a flight: the same words, or one's words appearing whole and in order in the other's ("Frozen" / "Frozen: The Musical"). */
export function namesFlight(copyLabel: string, flightName: string): boolean {
  const a = nameTokens(copyLabel);
  const b = nameTokens(flightName);
  if (a.length === 0 || b.length === 0) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.join(" ").length < 3) return false;
  for (let start = 0; start + short.length <= long.length; start++)
    if (short.every((word, index) => long[start + index] === word)) return true;
  return false;
}

interface Group {
  key: string;
  rows: LegacyCopyRow[];
}

/** Rows that are the same message for the same underwriter — one scheduling object repeated — become one copy spanning their dates. */
function groupRows(rows: LegacyCopyRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const identity = `${underwriterKey(row.underwriter)}\u0000${scriptKey(row.script)}`;
    const group = groups.get(identity);
    if (group) group.rows.push(row);
    else groups.set(identity, { key: String(row.row), rows: [row] });
  }
  return [...groups.values()];
}

function spanOf(rows: LegacyCopyRow[]): { startDate: string | null; endDate: string | null } {
  const starts = rows.map((row) => row.startDate);
  const ends = rows.map((row) => row.endDate);
  return {
    startDate: starts.includes(null) ? null : [...(starts as string[])].sort()[0]!,
    endDate: ends.includes(null) ? null : [...(ends as string[])].sort().at(-1)!,
  };
}

type UnderwriterResolution =
  | { kind: "matched"; id: string; name: string; viaAlias: boolean }
  | { kind: "create"; name: string }
  | { kind: "ambiguous"; candidates: SnapshotUnderwriter[] }
  | { kind: "unknown" };

export function resolveUnderwriter(
  sourceName: string,
  underwriters: SnapshotUnderwriter[],
): UnderwriterResolution {
  const byKey = (key: string) => underwriters.filter((entry) => underwriterKey(entry.name) === key);
  const key = underwriterKey(sourceName);
  const direct = byKey(key);
  if (direct.length === 1)
    return { kind: "matched", id: direct[0]!.id, name: direct[0]!.name, viaAlias: false };
  if (direct.length > 1) return { kind: "ambiguous", candidates: direct };

  const alias = UNDERWRITER_ALIASES[key];
  const withoutNetwork = key.replace(/^fpm /, "");
  for (const candidateKey of [
    alias ? underwriterKey(alias) : null,
    withoutNetwork !== key ? withoutNetwork : null,
  ]) {
    if (!candidateKey) continue;
    const found = byKey(candidateKey);
    if (found.length === 1)
      return { kind: "matched", id: found[0]!.id, name: found[0]!.name, viaAlias: true };
    if (found.length > 1) return { kind: "ambiguous", candidates: found };
  }
  const station = STATION_UNDERWRITERS.find((name) => underwriterKey(name) === key);
  if (station) return { kind: "create", name: station };
  return { kind: "unknown" };
}

type ResolvedUnderwriter =
  | { kind: "matched"; id: string; name: string; viaAlias: boolean }
  | { kind: "create"; name: string }
  | { kind: "skip" }
  | { kind: "waiting"; key: string; resolution: UnderwriterResolution };

function answeredUnderwriter(
  sourceName: string,
  snapshot: LegacyCopySnapshot,
  answers: LegacyCopyAnswers,
): ResolvedUnderwriter {
  const resolution = resolveUnderwriter(sourceName, snapshot.underwriters);
  if (resolution.kind === "matched" || resolution.kind === "create") return resolution;
  const key = `underwriter:${underwriterKey(sourceName)}`;
  const answer = answers[key];
  if (answer === SKIP) return { kind: "skip" };
  if (answer === NEW_UNDERWRITER) return { kind: "create", name: sourceName.trim() };
  const chosen = answer?.startsWith("id:")
    ? snapshot.underwriters.find((entry) => entry.id === answer.slice(3))
    : undefined;
  if (chosen) return { kind: "matched", id: chosen.id, name: chosen.name, viaAlias: true };
  return { kind: "waiting", key, resolution };
}

const DIFFERENCE_WORDING: Record<
  ScriptDifference,
  {
    question: (subject: string, count: number) => string;
    context: string;
    options: QuestionOption[];
    recommended: string;
  }
> = {
  correction: {
    question: (subject, count) =>
      count === 1
        ? `Copy for ${subject} reads slightly differently in the portal.`
        : `${count} messages for ${subject} read slightly differently in the portal.`,
    context:
      "The two versions differ by a few characters — usually words the old program-log import ran together. It is the same message either way.",
    options: [
      {
        value: USE_INCOMING,
        label: "Use RadioTraffic’s wording",
        hint: "Corrects the portal’s copy in place; its links and rotation stay",
      },
      {
        value: KEEP_PORTAL,
        label: "Keep the portal’s wording",
        hint: "Only its dates are updated",
      },
      { value: SKIP, label: "Leave it out", hint: "Nothing is written" },
    ],
    recommended: USE_INCOMING,
  },
  filled_in: {
    question: (subject, count) =>
      count === 1
        ? `The portal has the spot number filled in for ${subject}; RadioTraffic still shows a blank.`
        : `The portal has ${count} spot numbers filled in for ${subject}; RadioTraffic still shows blanks.`,
    context:
      "RadioTraffic prints the instruction with a blank where the spot number goes. It is the same message either way.",
    options: [
      {
        value: KEEP_PORTAL,
        label: "Keep the portal’s wording",
        hint: "Only its dates are updated",
      },
      {
        value: USE_INCOMING,
        label: "Use RadioTraffic’s wording",
        hint: "Puts the blank back into the portal’s copy",
      },
      { value: SKIP, label: "Leave it out", hint: "Nothing is written" },
    ],
    recommended: KEEP_PORTAL,
  },
  different: {
    question: (subject, count) =>
      count === 1
        ? `${subject} has a new message under a name and cart the portal already uses.`
        : `${subject} has ${count} new messages under names and carts the portal already uses.`,
    context:
      "RadioTraffic reuses a name and cart for the next month’s message. The portal’s copy by that name is left as it is.",
    options: [
      {
        value: NEW_COPY,
        label: "Add them as their own copy",
        hint: "Each dated as RadioTraffic has it",
      },
      { value: SKIP, label: "Leave them out", hint: "Nothing is written" },
    ],
    recommended: NEW_COPY,
  },
};

/**
 * The whole plan: every export row's disposition given what's on file and
 * the answers so far. Deterministic and side-effect free; the import writes
 * exactly the copies whose status is "ready".
 */
export function planLegacyCopyImport(
  rows: LegacyCopyRow[],
  snapshot: LegacyCopySnapshot,
  answers: LegacyCopyAnswers = {},
): LegacyCopyPlan {
  const questions = new Map<string, LegacyCopyQuestion>();
  const ask = (question: Omit<LegacyCopyQuestion, "rowCount">, rowCount: number) => {
    const existing = questions.get(question.key);
    if (existing) {
      existing.rowCount += rowCount;
      if (question.comparisons)
        existing.comparisons = [...(existing.comparisons ?? []), ...question.comparisons];
    } else questions.set(question.key, { ...question, rowCount });
  };

  const underwriterById = new Map(snapshot.underwriters.map((entry) => [entry.id, entry]));
  const contractsByUnderwriter = new Map<string, SnapshotContract[]>();
  for (const contract of snapshot.contracts) {
    const list = contractsByUnderwriter.get(contract.underwriter_id) ?? [];
    list.push(contract);
    contractsByUnderwriter.set(contract.underwriter_id, list);
  }
  const flightsByContract = new Map<string, SnapshotFlight[]>();
  for (const flight of snapshot.flights) {
    if (flight.status !== "active") continue;
    const list = flightsByContract.get(flight.contract_id) ?? [];
    list.push(flight);
    flightsByContract.set(flight.contract_id, list);
  }
  const contractIdsOf = (underwriterId: string) =>
    new Set((contractsByUnderwriter.get(underwriterId) ?? []).map((contract) => contract.id));
  /** Copy that belongs to an underwriter: attributed directly, or linked to one of its contracts. */
  const copyOfUnderwriter = (underwriterId: string): SnapshotCopy[] => {
    const contractIds = contractIdsOf(underwriterId);
    const linked = new Set(
      snapshot.links
        .filter((link) => contractIds.has(link.contract_id))
        .map((link) => link.copy_id),
    );
    return snapshot.copy.filter(
      (copy) => copy.underwriter_id === underwriterId || linked.has(copy.id),
    );
  };

  const copies: PlannedCopy[] = [];
  const excludedRows: PlannedCopy[] = [];
  const importable: LegacyCopyRow[] = [];
  for (const row of rows) {
    const excludedReason: ExcludedReason | null = isNotUnderwritingCopy(row)
      ? "not_copy"
      : isPlaceholderScript(row.script)
        ? "placeholder"
        : null;
    if (excludedReason === null) {
      importable.push(row);
      continue;
    }
    excludedRows.push({
      key: String(row.row),
      rows: [row.row],
      sourceUnderwriter: row.underwriter,
      underwriter: { kind: "unresolved" },
      label: row.label,
      cart: row.cart,
      script: row.script,
      startDate: row.startDate,
      endDate: row.endDate,
      sourceLengthSeconds: row.lengthSeconds,
      ...copyExecution(row),
      copy: { action: "none" },
      links: [],
      unlinkedReason: null,
      status: "excluded",
      waitingOn: [],
      excludedReason,
      notes: [],
    });
  }

  const groups = groupRows(importable);
  const resolved = new Map(
    groups.map((group) => [
      group.key,
      answeredUnderwriter(group.rows[0]!.underwriter, snapshot, answers),
    ]),
  );
  // Copy on file whose script some row repeats exactly is spoken for: a
  // near-miss row never claims it as "the same slot".
  const claimed = new Set<string>();
  for (const group of groups) {
    const underwriter = resolved.get(group.key)!;
    if (underwriter.kind !== "matched") continue;
    const key = scriptKey(group.rows[0]!.script);
    for (const copy of copyOfUnderwriter(underwriter.id))
      if (scriptKey(copy.script ?? "") === key) claimed.add(copy.id);
  }

  const newUnderwriters = new Set<string>();
  for (const group of groups) {
    const first = group.rows[0]!;
    const { startDate, endDate } = spanOf(group.rows);
    const planned: PlannedCopy = {
      key: group.key,
      rows: group.rows.map((row) => row.row),
      sourceUnderwriter: first.underwriter,
      underwriter: { kind: "unresolved" },
      label: first.label,
      cart: first.cart,
      script: first.script,
      startDate,
      endDate,
      sourceLengthSeconds: first.lengthSeconds,
      ...copyExecution(first),
      copy: { action: "none" },
      links: [],
      unlinkedReason: null,
      status: "waiting",
      waitingOn: [],
      excludedReason: null,
      notes: [],
    };
    copies.push(planned);
    if (group.rows.length > 1)
      planned.notes.push(
        `Listed ${group.rows.length} times in the export (rows ${planned.rows.join(", ")}); imported once for ${formatSourceDates(startDate, endDate)}.`,
      );

    // The underwriter.
    const underwriter = resolved.get(group.key)!;
    if (underwriter.kind === "skip") {
      planned.status = "excluded";
      planned.excludedReason = "skipped";
      continue;
    }
    const initial = resolveUnderwriter(first.underwriter, snapshot.underwriters);
    if (initial.kind === "unknown" || initial.kind === "ambiguous") {
      const key = `underwriter:${underwriterKey(first.underwriter)}`;
      const candidates = initial.kind === "ambiguous" ? initial.candidates : [];
      ask(
        {
          key,
          kind: "underwriter",
          subject: first.underwriter,
          question: `Who is “${first.underwriter}”?`,
          context:
            candidates.length > 0
              ? `More than one underwriter on file matches this name.`
              : "No underwriter on file has this name.",
          options: [
            ...candidates.map((entry) => ({
              value: `id:${entry.id}`,
              label: entry.name,
              hint: "An underwriter on file",
            })),
            {
              value: NEW_UNDERWRITER,
              label: `Add “${first.underwriter}” as a new underwriter`,
              hint: "Its copy comes in with no contract",
            },
            { value: SKIP, label: "Leave it out", hint: "Nothing is written for these rows" },
          ],
          recommended: null,
          choosesUnderwriter: true,
        },
        group.rows.length,
      );
    }
    if (underwriter.kind === "waiting") {
      planned.waitingOn.push(underwriter.key);
      continue;
    }
    planned.underwriter = underwriter;
    if (underwriter.kind === "create") newUnderwriters.add(underwriter.name);
    const underwriterId = underwriter.kind === "matched" ? underwriter.id : null;
    const underwriterName = underwriter.name;

    // The copy.
    const onFile = underwriterId ? copyOfUnderwriter(underwriterId) : [];
    const key = scriptKey(first.script);
    const sameSlot = (copy: SnapshotCopy) =>
      labelKey(copy.label) === labelKey(first.label) &&
      cartKey(copy.cart_identifier) === cartKey(first.cart);
    const sameScript = onFile
      .filter((copy) => scriptKey(copy.script ?? "") === key)
      .sort(
        (a, b) =>
          Number(sameSlot(b)) - Number(sameSlot(a)) || a.created_at.localeCompare(b.created_at),
      );
    let reuse: SnapshotCopy | null = sameScript[0] ?? null;
    let replaceScript = false;
    if (sameScript.length > 1)
      planned.notes.push(
        `${sameScript.length} copies on file have this script; the oldest is used.`,
      );

    if (!reuse) {
      const slot = onFile.find((copy) => sameSlot(copy) && !claimed.has(copy.id));
      if (slot) {
        const difference = classifyScriptDifference(slot.script ?? "", first.script);
        const wording = DIFFERENCE_WORDING[difference];
        const questionKey = `script:${underwriterId}:${difference}`;
        ask(
          {
            key: questionKey,
            kind: "script",
            subject: underwriterName,
            question: wording.question(underwriterName, 1),
            context: wording.context,
            options: wording.options,
            recommended: wording.recommended,
            comparisons: [
              {
                label: `${first.label}${first.cart ? ` · cart ${first.cart}` : ""}`,
                portal: slot.script ?? "",
                incoming: first.script,
                incomingDates: formatSourceDates(startDate, endDate),
              },
            ],
          },
          group.rows.length,
        );
        const answer = answers[questionKey];
        if (answer === SKIP) {
          planned.status = "excluded";
          planned.excludedReason = "skipped";
          continue;
        }
        const allowed = wording.options.some((option) => option.value === answer);
        if (!allowed) planned.waitingOn.push(questionKey);
        else if (answer === KEEP_PORTAL || answer === USE_INCOMING) {
          reuse = slot;
          replaceScript = answer === USE_INCOMING;
          claimed.add(slot.id);
        }
      }
    }

    if (reuse) {
      const updates: CopyUpdates = {};
      const changes: string[] = [];
      if (
        startDate !== null &&
        (reuse.effective_from !== startDate || reuse.effective_to !== endDate)
      ) {
        updates.effective_from = startDate;
        updates.effective_to = endDate;
        changes.push(`Dates set to ${formatSourceDates(startDate, endDate)}`);
      }
      if (reuse.cart_identifier === null && first.cart !== null) {
        updates.cart_identifier = first.cart;
        changes.push(`Cart ${first.cart} added`);
      }
      if (replaceScript) {
        updates.script = first.script;
        if (reuse.execution_kind === "live_read")
          updates.duration_seconds = estimateReadSeconds(first.script);
        changes.push("Wording corrected from RadioTraffic");
      }
      planned.copy = {
        action: "reuse",
        id: reuse.id,
        label: reuse.label,
        cart: reuse.cart_identifier,
        updates,
        changes,
      };
      if (labelKey(reuse.label) !== labelKey(first.label))
        planned.notes.push(`On file as “${reuse.label}”; its name is left as it is.`);
      if (reuse.cart_identifier !== null && cartKey(reuse.cart_identifier) !== cartKey(first.cart))
        planned.notes.push(`On file with cart ${reuse.cart_identifier}; left as it is.`);
      if (reuse.approval_status !== "approved")
        planned.notes.push(`On file as ${reuse.approval_status}; its status is left as it is.`);
    } else {
      planned.copy = { action: "create" };
    }
    const elsewhere = snapshot.copy.find(
      (copy) =>
        copy.underwriter_id !== null &&
        copy.underwriter_id !== underwriterId &&
        scriptKey(copy.script ?? "") === key,
    );
    if (elsewhere)
      planned.notes.push(
        `The same script is also on file under ${underwriterById.get(elsewhere.underwriter_id!)?.name ?? "another underwriter"}.`,
      );

    // The contract.
    if (!underwriterId) {
      planned.unlinkedReason =
        underwriter.kind === "create" && STATION_UNDERWRITERS.includes(underwriter.name)
          ? "Station copy has no contract"
          : "A new underwriter has no contracts";
    } else {
      const product = copyProduct(first);
      const all = (contractsByUnderwriter.get(underwriterId) ?? []).filter(
        (contract) =>
          (contract.status === "draft" || contract.status === "active") &&
          overlaps(startDate, endDate, contract.effective_from, contract.effective_to),
      );
      const broadcast = all.filter(
        (contract) => !isDigitalOnlyContract(contract.sponsorship_category),
      );
      const digital = all.length - broadcast.length;
      let chosen: SnapshotContract[] = [];
      let question: {
        key: string;
        options: SnapshotContract[];
        reason: "overlap" | "product";
      } | null = null;

      if (product) {
        const sameProduct = broadcast.filter(
          (contract) => productIn(contract.sponsorship_category ?? "") === product,
        );
        if (sameProduct.length === 1) chosen = sameProduct;
        else if (sameProduct.length > 1)
          question = {
            key: `contract:${underwriterId}:${product}`,
            options: sameProduct,
            reason: "overlap",
          };
        else if (broadcast.length > 0)
          question = {
            key: `contract:${underwriterId}:${product}`,
            options: broadcast,
            reason: "product",
          };
      } else {
        const byFlight = broadcast.filter((contract) =>
          (flightsByContract.get(contract.id) ?? []).some(
            (flight) =>
              namesFlight(first.label, flight.name) &&
              overlaps(startDate, endDate, flight.start_date, flight.end_date),
          ),
        );
        if (byFlight.length === 1) chosen = byFlight;
        else if (broadcast.length === 1) chosen = broadcast;
        else if (broadcast.length > 1)
          question = {
            key: `contract:${underwriterId}:${broadcast
              .map((contract) => contract.id)
              .sort()
              .join(",")}`,
            options: broadcast,
            reason: "overlap",
          };
      }

      if (question) {
        const answer = answers[question.key];
        ask(
          {
            key: question.key,
            kind: "contract",
            subject: underwriterName,
            question:
              question.reason === "product"
                ? `Should the ${productName(product!)} copy for ${underwriterName} join ${question.options.length === 1 ? "its" : "one of its"} other agreement${question.options.length === 1 ? "" : "s"}?`
                : `Which agreement does the copy for ${underwriterName} rotate on?`,
            context:
              question.reason === "product"
                ? `No ${productName(product!)} agreement is on file for these dates. Copy linked to an agreement rotates with that agreement’s other copy.`
                : "More than one agreement covers the copy’s dates. Every copy the answer covers goes to the same place, so a rotation isn’t split.",
            options: [
              ...question.options.map((contract) => ({
                value: contract.id,
                label: contractLabel(contract),
                hint:
                  (flightsByContract.get(contract.id) ?? []).length > 0
                    ? `${(flightsByContract.get(contract.id) ?? []).length} flights`
                    : "Joins this contract’s rotation",
              })),
              ...(question.reason === "overlap" && question.options.length > 1
                ? [
                    {
                      value: EVERY_CONTRACT,
                      label: "Every one of them",
                      hint: "Each contract rotates it",
                    },
                  ]
                : []),
              {
                value: NO_CONTRACT,
                label: "Keep it with the underwriter for now",
                hint: "Link it later from the contract’s Copy tab",
              },
            ],
            recommended: question.reason === "product" ? NO_CONTRACT : null,
          },
          group.rows.length,
        );
        if (answer === NO_CONTRACT) planned.unlinkedReason = "Kept with the underwriter";
        else if (answer === EVERY_CONTRACT && question.options.length > 1)
          chosen = question.options;
        else if (answer && question.options.some((contract) => contract.id === answer))
          chosen = question.options.filter((contract) => contract.id === answer);
        else planned.waitingOn.push(question.key);
      } else if (chosen.length === 0) {
        planned.unlinkedReason =
          (contractsByUnderwriter.get(underwriterId) ?? []).length === 0
            ? "No contract on file"
            : digital > 0 && broadcast.length === 0
              ? "Its only agreement is digital"
              : "No agreement covers these dates";
      }
      if (digital > 0 && broadcast.length > 0)
        planned.notes.push(
          `${digital === 1 ? "A digital-only agreement was" : `${digital} digital-only agreements were`} left out of the match.`,
        );

      // The flight, for each chosen contract.
      for (const contract of chosen) {
        const flights = flightsByContract.get(contract.id) ?? [];
        const existingLink =
          planned.copy.action === "reuse"
            ? snapshot.links.find(
                (link) =>
                  link.contract_id === contract.id &&
                  link.copy_id === (planned.copy as { id: string }).id,
              )
            : undefined;
        if (existingLink) {
          planned.links.push({
            contractId: contract.id,
            contractLabel: contractLabel(contract),
            flightId: existingLink.flight_id,
            flightName: flights.find((entry) => entry.id === existingLink.flight_id)?.name ?? null,
            scheduleLineId: existingLink.schedule_line_id ?? null,
            scheduleLineLabel:
              (snapshot.lines ?? []).find((line) => line.id === existingLink.schedule_line_id)
                ?.label ?? null,
            exists: true,
          });
          continue;
        }
        const named = flights.filter(
          (flight) =>
            namesFlight(first.label, flight.name) &&
            overlaps(startDate, endDate, flight.start_date, flight.end_date),
        );
        let flight: SnapshotFlight | null = null;
        let candidates: SnapshotFlight[] = [];
        if (named.length === 1) flight = named[0]!;
        else if (named.length > 1) candidates = named;
        else if (startDate && endDate) {
          const around = flights.filter(
            (entry) =>
              startDate >= addDays(entry.start_date, -14) && endDate <= addDays(entry.end_date, 7),
          );
          if (around.length === 1) candidates = around;
        }
        if (candidates.length > 0) {
          const questionKey = `flight:${planned.key}:${contract.id}`;
          ask(
            {
              key: questionKey,
              kind: "flight",
              subject: `${underwriterName} · ${first.label}`,
              question:
                candidates.length === 1
                  ? `Is “${first.label}” copy for the ${candidates[0]!.name} flight?`
                  : `Which flight is “${first.label}” copy for?`,
              context: `It runs ${formatSourceDates(startDate, endDate)}. Copy for a flight only airs on that flight’s lines.`,
              options: [
                ...candidates.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                  hint: formatDateRange(entry.start_date, entry.end_date),
                })),
                {
                  value: WHOLE_CONTRACT,
                  label: "The whole contract",
                  hint: "It can air on any of the contract’s lines",
                },
              ],
              recommended: null,
            },
            group.rows.length,
          );
          const answer = answers[questionKey];
          if (answer === WHOLE_CONTRACT) flight = null;
          else if (answer && candidates.some((entry) => entry.id === answer))
            flight = candidates.find((entry) => entry.id === answer)!;
          else {
            planned.waitingOn.push(questionKey);
            continue;
          }
        }
        planned.links.push({
          contractId: contract.id,
          contractLabel: contractLabel(contract),
          flightId: flight?.id ?? null,
          flightName: flight?.name ?? null,
          scheduleLineId: null,
          scheduleLineLabel: null,
          exists: false,
        });
      }
    }

    if (planned.waitingOn.length > 0) planned.status = "waiting";
    else if (
      planned.copy.action === "reuse" &&
      planned.copy.changes.length === 0 &&
      planned.underwriter.kind === "matched" &&
      planned.links.every((link) => link.exists)
    )
      planned.status = "done";
    else planned.status = "ready";
  }

  dedicateCarpoolCopy(copies, snapshot);

  // A script question's wording is written for one copy; restate it for the count it covers.
  for (const question of questions.values()) {
    if (question.kind !== "script") continue;
    const difference = question.key.split(":").at(-1) as ScriptDifference;
    question.question = DIFFERENCE_WORDING[difference].question(
      question.subject,
      question.comparisons?.length ?? 1,
    );
  }

  const all = [...copies, ...excludedRows];
  const counts: LegacyCopyPlan["counts"] = {
    rows: rows.length,
    ready: 0,
    done: 0,
    waiting: 0,
    excluded: 0,
    placeholders: 0,
    notCopy: 0,
    skipped: 0,
    create: 0,
    reuse: 0,
    updated: 0,
    linksToCreate: 0,
    underwriterOnly: 0,
  };
  for (const planned of all) {
    const size = planned.rows.length;
    if (planned.status === "excluded") {
      counts.excluded += size;
      if (planned.excludedReason === "placeholder") counts.placeholders += size;
      if (planned.excludedReason === "not_copy") counts.notCopy += size;
      if (planned.excludedReason === "skipped") counts.skipped += size;
    } else if (planned.status === "waiting") counts.waiting += size;
    else if (planned.status === "done") counts.done += size;
    else {
      counts.ready += size;
      if (planned.copy.action === "create") counts.create += 1;
      if (planned.copy.action === "reuse") {
        counts.reuse += 1;
        if (planned.copy.changes.length > 0) counts.updated += 1;
      }
      counts.linksToCreate += planned.links.filter((link) => !link.exists).length;
      if (planned.links.length === 0) counts.underwriterOnly += 1;
    }
  }

  const order: Record<LegacyCopyQuestionKind, number> = {
    underwriter: 0,
    contract: 1,
    flight: 2,
    script: 3,
  };
  return {
    copies: all.sort((a, b) => a.rows[0]! - b.rows[0]!),
    questions: [...questions.values()].sort(
      (a, b) => order[a.kind] - order[b.kind] || a.subject.localeCompare(b.subject),
    ),
    newUnderwriters: [...newUnderwriters].filter((name) =>
      copies.some(
        (copy) =>
          copy.status === "ready" &&
          copy.underwriter.kind === "create" &&
          copy.underwriter.name === name,
      ),
    ),
    counts,
  };
}

/** A copy name or a line that means WUWF's Carpool feature ("car pool", "Wed Carpool", "copy 1 - car pool"). */
export function isCarpoolName(text: string | null | undefined): boolean {
  return /\bcar\s*pool\b/i.test(text ?? "");
}

/**
 * Dedicates Carpool copy to the contract's Carpool line (§16), the way the
 * orders read: End of Line Cafe's "For Carpool: #1 … For Total Program:
 * #2", First City's separate Carpool script. Only when it is safe to:
 * the contract has exactly one Carpool line among several, and some other
 * message — linked by this import or already — is left for the other
 * lines. A sponsor whose only message is its Carpool copy, or whose
 * contract is only the Carpool line, stays contract-wide, since
 * dedicating it would leave nothing (or change nothing). Only new links
 * are scoped; an existing link keeps whatever scope staff gave it.
 */
function dedicateCarpoolCopy(copies: PlannedCopy[], snapshot: LegacyCopySnapshot): void {
  const lines = snapshot.lines ?? [];
  if (lines.length === 0) return;
  const linesByContract = new Map<string, SnapshotLine[]>();
  for (const line of lines)
    linesByContract.set(line.contract_id, [...(linesByContract.get(line.contract_id) ?? []), line]);

  const linking = copies.filter((copy) => copy.status === "ready" || copy.status === "done");
  for (const [contractId, contractLines] of linesByContract) {
    if (contractLines.length < 2) continue;
    const carpoolLines = contractLines.filter(
      (line) => isCarpoolName(line.pool_name) || isCarpoolName(line.label),
    );
    if (carpoolLines.length !== 1) continue;
    const carpoolLine = carpoolLines[0]!;

    const onContract = linking.flatMap((copy) =>
      copy.links.filter((link) => link.contractId === contractId).map((link) => ({ copy, link })),
    );
    const carpool = onContract.filter(
      ({ copy, link }) => isCarpoolName(copy.label) && !link.exists && link.flightId === null,
    );
    const importedGeneral = onContract.some(({ copy }) => !isCarpoolName(copy.label));
    const onFileGeneral = snapshot.links.some(
      (link) =>
        link.contract_id === contractId &&
        !link.schedule_line_id &&
        !onContract.some(
          ({ copy }) => copy.copy.action === "reuse" && copy.copy.id === link.copy_id,
        ) &&
        !isCarpoolName(snapshot.copy.find((entry) => entry.id === link.copy_id)?.label),
    );
    if (carpool.length === 0 || !(importedGeneral || onFileGeneral)) continue;

    for (const { copy, link } of carpool) {
      link.scheduleLineId = carpoolLine.id;
      link.scheduleLineLabel = carpoolLine.label;
      copy.notes.push(
        `Dedicated to the ${carpoolLine.label} line, as the order gives Carpool its own message; the contract's other messages serve its other lines.`,
      );
    }
  }
}

/**
 * The order the import writes new copy in: by underwriter, then by label
 * ("Copy 1" before "Copy 2"), then by date — the rotation cycles a
 * contract's copy in creation order, so this keeps RadioTraffic's naming
 * order on air.
 */
export function creationOrder(copies: PlannedCopy[]): PlannedCopy[] {
  return [...copies].sort(
    (a, b) =>
      a.sourceUnderwriter.localeCompare(b.sourceUnderwriter) ||
      compareLabels(a.label, b.label) ||
      (a.startDate ?? "").localeCompare(b.startDate ?? "") ||
      Number(a.key) - Number(b.key),
  );
}

/** The answers the form posts, as JSON — anything malformed is dropped (that question then stays open). */
export function parseLegacyCopyAnswers(json: string): LegacyCopyAnswers {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return {};
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const answers: LegacyCopyAnswers = {};
  for (const [key, answer] of Object.entries(value as Record<string, unknown>))
    if (typeof answer === "string" && key.length <= 300 && answer.length <= 200)
      answers[key] = answer;
  return answers;
}
