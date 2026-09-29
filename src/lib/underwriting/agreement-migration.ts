// Bulk migration of legacy agreements (docs/underwriting-traffic-redesign.md
// §14). Pure: parsing the migration manifest (CSV), deriving each entry's
// idempotency key, turning an entry into the order step's own typed fields
// — the same TypedOrderFields a staffer's typing becomes, so
// mergeOrderFacts() gives the manifest precedence over the document exactly
// as it gives the form precedence — matching an entry to its document by
// filename, deciding whether an entry may run, and listing where the
// document's reading disagrees with the manifest. No Supabase, no fetch;
// the writes are the migration route's actions.ts, and each entry goes
// through agreement-import-service.ts, the one import path.

import { isValidDateISO } from "./dates";
import type { AgreementModelOutput, NamedId, TypedOrderFields } from "./agreement-import";

// ---- CSV ----------------------------------------------------------------

/**
 * RFC 4180-ish: comma-separated, double-quoted fields may hold commas,
 * newlines and doubled quotes. Accepts CRLF or LF, ignores a byte-order
 * mark and blank lines. A spreadsheet's "Save as CSV" is what this reads.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endRow = () => {
    row.push(field);
    field = "";
    if (!(row.length === 1 && row[0]!.trim() === "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      endRow();
      if (char === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      field += char;
    }
    i += 1;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

// ---- The manifest -------------------------------------------------------

/** One manifest entry, normalised. Everything but the underwriter and the document is optional. */
export interface MigrationManifestRow {
  /** 1-based data row number in the manifest, for error messages. */
  row: number;
  /** The idempotency key: source_key if given, else the Drive file id, else the document's filename. */
  sourceKey: string;
  underwriterName: string;
  contractIdentifier: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sponsorshipTotal: number | null;
  /** Local/direct, trade, FPM/FPBS… — kept as the manifest words it. */
  contractType: string | null;
  /** The document's filename (a path is fine; the basename is what's matched). */
  sourceFile: string;
  driveFileId: string | null;
  /** E.g. "incomplete signature" — carried onto the contract's notes, never interpreted. */
  documentationStatus: string | null;
  notes: string | null;
}

export interface ManifestError {
  row: number | null;
  message: string;
}

export interface ParsedManifest {
  rows: MigrationManifestRow[];
  errors: ManifestError[];
}

type ManifestField =
  | "source_key"
  | "underwriter"
  | "contract_identifier"
  | "effective_from"
  | "effective_to"
  | "sponsorship_total"
  | "contract_type"
  | "source_file"
  | "drive_file_id"
  | "documentation_status"
  | "notes";

/** Header spellings accepted for each field, compared after lower-casing and collapsing punctuation to underscores. */
const HEADER_ALIASES: Record<ManifestField, string[]> = {
  source_key: ["source_key", "key", "migration_key", "id"],
  underwriter: ["underwriter", "underwriter_name", "sponsor", "client"],
  contract_identifier: [
    "contract_identifier",
    "contract_id",
    "contract_number",
    "contract",
    "order_number",
    "io_number",
    "insertion_order",
  ],
  effective_from: ["effective_from", "start", "start_date", "effective_start", "from"],
  effective_to: ["effective_to", "end", "end_date", "effective_end", "to"],
  sponsorship_total: ["sponsorship_total", "total", "amount", "dollar_total", "contract_total"],
  contract_type: ["contract_type", "type", "source_classification", "classification"],
  source_file: ["source_file", "file", "filename", "pdf", "document", "source_pdf", "path"],
  drive_file_id: ["drive_file_id", "drive_id", "file_id"],
  documentation_status: ["documentation_status", "doc_status", "documentation"],
  notes: ["notes", "note", "comments"],
};

function headerKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** A real calendar date — isValidDateISO() checks the shape, and Date rolls Feb 30 over to March. */
function isCalendarDate(iso: string): boolean {
  return isValidDateISO(iso) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;
}

/** YYYY-MM-DD, or M/D/YYYY (and M/D/YY, as 20YY) — the two shapes a spreadsheet export produces. */
export function parseManifestDate(value: string): string | null {
  const trimmed = value.trim();
  if (isCalendarDate(trimmed)) return trimmed;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);
  if (!match) return null;
  const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!;
  const iso = `${year}-${match[1]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  return isCalendarDate(iso) ? iso : null;
}

/** "$1,234.50" → 1234.5; blank → null; anything else unreadable → NaN. */
export function parseManifestMoney(value: string): number | null {
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number.parseFloat(cleaned);
}

/** The last path segment, so "Business/2026/Acme IO.pdf" and "Acme IO.pdf" name the same document. */
export function documentBasename(path: string): string {
  const parts = path.trim().split(/[\\/]/);
  return parts[parts.length - 1]!.trim();
}

/** The key a manifest entry is imported under — stable across reruns of the same spreadsheet. */
export function manifestSourceKey(entry: {
  sourceKey: string | null;
  driveFileId: string | null;
  sourceFile: string;
}): string {
  if (entry.sourceKey) return entry.sourceKey.trim();
  if (entry.driveFileId) return `drive:${entry.driveFileId.trim()}`;
  return `file:${documentBasename(entry.sourceFile).toLowerCase()}`;
}

export const MAX_MANIFEST_ROWS = 500;

/**
 * The manifest, row by row. A header row is required; `underwriter` and
 * `source_file` are the only required columns. A row that doesn't validate
 * is reported with its number and left out — the valid rows still load, so
 * one typo doesn't block the other forty-nine. Two rows with one key are
 * both refused, since which one is meant can't be told.
 */
export function parseMigrationManifest(text: string): ParsedManifest {
  const table = parseCsv(text);
  const errors: ManifestError[] = [];
  if (table.length === 0)
    return { rows: [], errors: [{ row: null, message: "The manifest is empty." }] };

  const header = table[0]!.map(headerKey);
  const columnOf = new Map<ManifestField, number>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ManifestField, string[]][]) {
    const index = header.findIndex((name) => aliases.includes(name));
    if (index !== -1) columnOf.set(field, index);
  }
  const missing = (["underwriter", "source_file"] as const).filter((field) => !columnOf.has(field));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: null,
          message: `The manifest has no ${missing.join(" or ")} column. The first row must name the columns.`,
        },
      ],
    };
  }

  const data = table.slice(1);
  if (data.length > MAX_MANIFEST_ROWS) {
    return {
      rows: [],
      errors: [{ row: null, message: `A manifest can hold at most ${MAX_MANIFEST_ROWS} rows.` }],
    };
  }

  const candidates: MigrationManifestRow[] = [];
  data.forEach((cells, offset) => {
    const row = offset + 1;
    const cell = (field: ManifestField) => {
      const index = columnOf.get(field);
      return index === undefined ? null : blankToNull(cells[index]);
    };
    const rowErrors: string[] = [];

    const underwriterName = cell("underwriter");
    if (!underwriterName) rowErrors.push("no underwriter");
    const sourceFile = cell("source_file");
    if (!sourceFile) rowErrors.push("no source file");

    const date = (field: "effective_from" | "effective_to") => {
      const raw = cell(field);
      if (raw === null) return null;
      const parsed = parseManifestDate(raw);
      if (parsed === null)
        rowErrors.push(`${field} "${raw}" isn't a date (YYYY-MM-DD or M/D/YYYY)`);
      return parsed;
    };
    const effectiveFrom = date("effective_from");
    const effectiveTo = date("effective_to");
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)
      rowErrors.push("effective_to is before effective_from");

    const rawTotal = cell("sponsorship_total");
    const sponsorshipTotal = rawTotal === null ? null : parseManifestMoney(rawTotal);
    if (sponsorshipTotal !== null && !Number.isFinite(sponsorshipTotal))
      rowErrors.push(`sponsorship_total "${rawTotal}" isn't an amount`);

    if (rowErrors.length > 0 || !underwriterName || !sourceFile) {
      errors.push({ row, message: rowErrors.join("; ") });
      return;
    }

    const driveFileId = cell("drive_file_id");
    candidates.push({
      row,
      sourceKey: manifestSourceKey({ sourceKey: cell("source_key"), driveFileId, sourceFile }),
      underwriterName,
      contractIdentifier: cell("contract_identifier"),
      effectiveFrom,
      effectiveTo,
      sponsorshipTotal,
      contractType: cell("contract_type"),
      sourceFile,
      driveFileId,
      documentationStatus: cell("documentation_status"),
      notes: cell("notes"),
    });
  });

  const byKey = new Map<string, MigrationManifestRow[]>();
  for (const candidate of candidates) {
    const key = candidate.sourceKey.toLowerCase();
    byKey.set(key, [...(byKey.get(key) ?? []), candidate]);
  }
  const rows: MigrationManifestRow[] = [];
  for (const candidate of candidates) {
    const same = byKey.get(candidate.sourceKey.toLowerCase())!;
    if (same.length > 1) {
      errors.push({
        row: candidate.row,
        message: `shares the key "${candidate.sourceKey}" with row ${same
          .filter((other) => other !== candidate)
          .map((other) => other.row)
          .join(", ")} — give each row its own source_key`,
      });
    } else {
      rows.push(candidate);
    }
  }
  errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return { rows, errors };
}

// ---- An entry against what's on file ------------------------------------

function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The underwriter on file with exactly this name (case and spacing aside), or null — never a fuzzy match. */
export function resolveManifestUnderwriter(name: string, underwriters: NamedId[]): NamedId | null {
  const wanted = normalizedName(name);
  return underwriters.find((entry) => normalizedName(entry.name) === wanted) ?? null;
}

/** The fields of the contract's notes that record where it came from — the manifest's own words, never interpreted. */
export function migrationNotes(
  entry: Pick<
    MigrationManifestRow,
    "sourceKey" | "sourceFile" | "contractType" | "documentationStatus" | "notes"
  >,
  batchLabel: string,
): string {
  return [
    `Migrated from legacy records (batch "${batchLabel}", key ${entry.sourceKey}).`,
    `Source document: ${entry.sourceFile}.`,
    entry.contractType ? `Contract type: ${entry.contractType}.` : null,
    entry.documentationStatus ? `Documentation: ${entry.documentationStatus}.` : null,
    entry.notes ? `Notes: ${entry.notes}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** The manifest entry as the order step's typed fields — so mergeOrderFacts() gives it the same precedence a staffer's typing has. */
export function typedFieldsFromManifest(
  entry: Pick<
    MigrationManifestRow,
    | "sourceKey"
    | "sourceFile"
    | "contractType"
    | "documentationStatus"
    | "notes"
    | "contractIdentifier"
    | "effectiveFrom"
    | "effectiveTo"
    | "sponsorshipTotal"
  >,
  underwriterId: string,
  batchLabel: string,
): TypedOrderFields {
  return {
    underwriter_id: underwriterId,
    contract_identifier: entry.contractIdentifier ?? "",
    effective_from: entry.effectiveFrom ?? "",
    effective_to: entry.effectiveTo ?? "",
    sponsorship_total: entry.sponsorshipTotal === null ? "" : String(entry.sponsorshipTotal),
    sponsorship_category: "",
    notes: migrationNotes(entry, batchLabel),
  };
}

/** The chosen file whose name matches the entry's document (basename, case aside), or null. */
export function matchDocumentFile<T extends { name: string }>(
  sourceFile: string,
  files: T[],
): T | null {
  const wanted = documentBasename(sourceFile).toLowerCase();
  return files.find((file) => documentBasename(file.name).toLowerCase() === wanted) ?? null;
}

// ---- Whether an entry may run -------------------------------------------

export type MigrationItemStatus = "pending" | "processing" | "imported" | "failed";

/** A run that has held an entry this long without finishing is taken to have died (a closed tab, a timeout). */
export const STALE_PROCESSING_MINUTES = 15;

export interface MigrationItemState {
  status: MigrationItemStatus;
  contract_id: string | null;
  started_at: string | null;
}

/**
 * Whether an entry may be (re)imported now: never read, or failed, or
 * imported but its draft since deleted (the key is free again), or stuck
 * processing past the stale limit. An imported entry whose contract exists
 * never runs again — that is the rerun guarantee.
 */
export function canRunMigrationItem(item: MigrationItemState, now: Date = new Date()): boolean {
  if (item.status === "pending" || item.status === "failed") return true;
  if (item.status === "imported") return item.contract_id === null;
  if (item.started_at === null) return true;
  return now.getTime() - new Date(item.started_at).getTime() > STALE_PROCESSING_MINUTES * 60_000;
}

/** Whether a manifest resubmission may overwrite an entry's facts — not once it has a contract, and not mid-run. */
export function canUpdateMigrationItemFacts(
  item: MigrationItemState,
  now: Date = new Date(),
): boolean {
  if (item.status === "imported") return item.contract_id === null;
  return canRunMigrationItem(item, now);
}

// ---- Where the document disagrees with the manifest ---------------------

function sameName(a: string, b: string): boolean {
  return normalizedName(a) === normalizedName(b);
}

/**
 * The manifest wins every one of these (mergeOrderFacts already applied it);
 * a disagreement is listed so a person checks whether the spreadsheet or
 * the reading is wrong before activating. Also flags read lines that run
 * outside the manifest's dates.
 */
export function manifestDiscrepancies(
  entry: Pick<
    MigrationManifestRow,
    "underwriterName" | "contractIdentifier" | "effectiveFrom" | "effectiveTo" | "sponsorshipTotal"
  >,
  output: AgreementModelOutput,
): string[] {
  const order = output.order;
  const warnings: string[] = [];

  if (
    order.underwriter !== null &&
    order.underwriter !== "NEW" &&
    !sameName(order.underwriter, entry.underwriterName)
  )
    warnings.push(
      `The document reads as being for "${order.underwriter}"; the manifest says "${entry.underwriterName}".`,
    );
  if (order.underwriter === "NEW" && order.new_underwriter_name)
    warnings.push(
      `The document names "${order.new_underwriter_name}", who isn't on file; the manifest's "${entry.underwriterName}" was used.`,
    );
  if (
    entry.contractIdentifier &&
    order.contract_identifier &&
    entry.contractIdentifier.trim().toLowerCase() !== order.contract_identifier.trim().toLowerCase()
  )
    warnings.push(
      `The document's order number is "${order.contract_identifier}"; the manifest's "${entry.contractIdentifier}" was used.`,
    );
  if (entry.effectiveFrom && order.effective_from && order.effective_from !== entry.effectiveFrom)
    warnings.push(
      `The document starts ${order.effective_from}; the manifest's ${entry.effectiveFrom} was used.`,
    );
  if (entry.effectiveTo && order.effective_to && order.effective_to !== entry.effectiveTo)
    warnings.push(
      `The document ends ${order.effective_to}; the manifest's ${entry.effectiveTo} was used.`,
    );
  if (
    entry.sponsorshipTotal !== null &&
    order.sponsorship_total !== null &&
    Math.abs(order.sponsorship_total - entry.sponsorshipTotal) >= 0.005
  )
    warnings.push(
      `The document's total is ${order.sponsorship_total.toFixed(2)}; the manifest's ${entry.sponsorshipTotal.toFixed(2)} was used.`,
    );

  output.lines.forEach((line, index) => {
    const label = line.label.trim() || `Line ${index + 1}`;
    if (
      entry.effectiveFrom &&
      isValidDateISO(line.start_date) &&
      line.start_date < entry.effectiveFrom
    )
      warnings.push(
        `"${label}" starts ${line.start_date}, before the manifest's ${entry.effectiveFrom}.`,
      );
    if (
      entry.effectiveTo &&
      line.end_date !== null &&
      isValidDateISO(line.end_date) &&
      line.end_date > entry.effectiveTo
    )
      warnings.push(`"${label}" ends ${line.end_date}, after the manifest's ${entry.effectiveTo}.`);
  });

  return warnings;
}

// ---- What an entry's run leaves on its row ------------------------------

/** uw_agreement_migration_items.result — what the last successful import found. */
export interface MigrationItemResult {
  lines_read: number;
  lines_saved: number;
  flights_created: number;
  unresolved: number;
  /** The merge's and each unsaved line's warnings, then the manifest discrepancies. */
  warnings: string[];
  /** Set when the contract was found already imported under the key rather than created by this run. */
  recovered?: boolean;
}

/** Reads a stored result back, or null when absent or malformed. */
export function parseMigrationItemResult(raw: unknown): MigrationItemResult | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const count = (key: string) => (typeof value[key] === "number" ? (value[key] as number) : 0);
  return {
    lines_read: count("lines_read"),
    lines_saved: count("lines_saved"),
    flights_created: count("flights_created"),
    unresolved: count("unresolved"),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((entry): entry is string => typeof entry === "string")
      : [],
    recovered: value.recovered === true,
  };
}

/** The row a manifest entry is stored as — the fields a resubmission may overwrite. */
export function migrationItemFactsFromRow(row: MigrationManifestRow, batchLabel: string) {
  return {
    batch_label: batchLabel,
    manifest_row: row.row,
    underwriter_name: row.underwriterName,
    contract_identifier: row.contractIdentifier,
    effective_from: row.effectiveFrom,
    effective_to: row.effectiveTo,
    sponsorship_total: row.sponsorshipTotal,
    contract_type: row.contractType,
    source_file: row.sourceFile,
    drive_file_id: row.driveFileId,
    documentation_status: row.documentationStatus,
    notes: row.notes,
  };
}

/** A stored manifest entry back in the manifest's shape, for typedFieldsFromManifest and manifestDiscrepancies. Not for a documents-only entry, which has no underwriter. */
export function manifestRowFromItem(item: {
  source_key: string;
  manifest_row: number | null;
  underwriter_name: string;
  contract_identifier: string | null;
  effective_from: string | null;
  effective_to: string | null;
  sponsorship_total: number | null;
  contract_type: string | null;
  source_file: string;
  drive_file_id: string | null;
  documentation_status: string | null;
  notes: string | null;
}): MigrationManifestRow {
  return {
    row: item.manifest_row ?? 0,
    sourceKey: item.source_key,
    underwriterName: item.underwriter_name,
    contractIdentifier: item.contract_identifier,
    effectiveFrom: item.effective_from,
    effectiveTo: item.effective_to,
    sponsorshipTotal: item.sponsorship_total === null ? null : Number(item.sponsorship_total),
    contractType: item.contract_type,
    sourceFile: item.source_file,
    driveFileId: item.drive_file_id,
    documentationStatus: item.documentation_status,
    notes: item.notes,
  };
}

// ---- Documents-only entries (§14.3) -------------------------------------

/**
 * A fallback for an agreement the manifest doesn't list: the document is
 * the entry, keyed by the hash of its bytes, and the reading supplies every
 * fact — "Create from the agreement", once per file. Re-choosing the same
 * file keys the same way; a re-scan is a different file and a different
 * entry, which is why an import also refuses any document another entry
 * already imported.
 */
export const DOCUMENT_ONLY_KEY_PREFIX = "sha256:";

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function documentOnlySourceKey(sha256: string): string {
  return `${DOCUMENT_ONLY_KEY_PREFIX}${sha256.toLowerCase()}`;
}

/** The hash a documents-only key names, or null for a manifest entry's key. */
export function documentOnlyHash(sourceKey: string): string | null {
  if (!sourceKey.startsWith(DOCUMENT_ONLY_KEY_PREFIX)) return null;
  const hash = sourceKey.slice(DOCUMENT_ONLY_KEY_PREFIX.length);
  return isSha256Hex(hash) ? hash : null;
}

/** Nothing typed: the reading fills every field, and the notes record where the draft came from. */
export function typedFieldsForDocumentOnly(
  entry: { sourceKey: string; sourceFile: string },
  batchLabel: string,
): TypedOrderFields {
  return {
    underwriter_id: "",
    contract_identifier: "",
    effective_from: "",
    effective_to: "",
    sponsorship_total: "",
    sponsorship_category: "",
    notes: [
      migrationNotes(
        { ...entry, contractType: null, documentationStatus: null, notes: null },
        batchLabel,
      ),
      "No manifest entry: every fact was read from the document.",
    ].join("\n"),
  };
}
