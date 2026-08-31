// Pure, dependency-free verification + assembly for the AI-parsed program
// log (program-log-ai-parse.ts is the thin network-call wrapper around this
// module). The model is never trusted to retype content or to correctly
// self-report something checkable — every value it reports back is verified
// against the actual extracted source text (or, for underwriters, against
// the known list it was given) before it's used for anything. A value that
// can't be verified is dropped, never guessed at or silently kept: this
// module's whole job is turning "the model claims X" into "X is confirmed,"
// or discarding it with a warning.

/** Curly quotes/apostrophes → straight, so a model-typed value can still locate itself in the source text either way. */
function normalizeQuotes(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

/** Whether `value` appears literally (after quote normalization) anywhere in `source`. */
export function containsLiteral(source: string, value: string): boolean {
  return findLiteralIndex(source, value, 0) !== -1;
}

/** Index of `value` in `source` at or after `fromIndex` (quote-normalized on both sides), or -1. */
export function findLiteralIndex(source: string, value: string, fromIndex: number): number {
  const trimmed = normalizeQuotes(value.trim());
  if (trimmed === "") return -1;
  return normalizeQuotes(source).indexOf(trimmed, fromIndex);
}

export interface VerifiedSpan {
  text: string;
  /** Index just past the end of the matched closing phrase, in `source` — the next span search should start no earlier than this. */
  endIndex: number;
}

/**
 * Locates a verbatim span of `source` bounded by two short phrases the model
 * claims open and close it (e.g. a credit's first and last several words),
 * and returns the exact source substring between them — never text the
 * model supplied directly. Returns null when either phrase can't be found,
 * in order, at or after `fromIndex`, or when they resolve to an empty span.
 */
export function extractVerifiedSpan(
  source: string,
  openingWords: string,
  closingWords: string,
  fromIndex = 0,
): VerifiedSpan | null {
  const opening = normalizeQuotes(openingWords.trim());
  const closing = normalizeQuotes(closingWords.trim());
  if (opening === "" || closing === "") return null;

  const normalizedSource = normalizeQuotes(source);
  const startIndex = normalizedSource.indexOf(opening, fromIndex);
  if (startIndex === -1) return null;

  const closingIndex = normalizedSource.indexOf(closing, startIndex);
  if (closingIndex === -1) return null;

  const endIndex = closingIndex + closing.length;
  const text = source.slice(startIndex, endIndex).trim();
  if (text === "") return null;

  return { text, endIndex };
}

const TIME_RE = /^\d{1,2}:\d{2}:\d{2}$/;
const LENGTH_RE = /^\(?\d{1,2}:\d{2}(?::\d{2})?\)?$/;
/** How far past a row's own time its own description is expected to print — one row's worth of text, generously sized. */
const ROW_WINDOW = 300;

/** Every index at which `value` occurs in `source`, left to right. */
function findAllIndices(source: string, value: string): number[] {
  const indices: number[] = [];
  let from = 0;
  while (true) {
    const index = source.indexOf(value, from);
    if (index === -1) return indices;
    indices.push(index);
    from = index + Math.max(value.length, 1);
  }
}

/**
 * Locates one specific row's own position in `source` — independent of any
 * other row, and independent of what order the model reported rows in.
 * Structured-output schemas constrain each item's shape, never cross-item
 * ordering, and a model doesn't reliably preserve document order for two
 * rows that happen to share a printed time (an avail marker and the credit
 * that fills it both print the same instant). Every real row pairs its
 * printed time with its own printed description on the same line, so when a
 * time value repeats across the day, the description is what tells the two
 * rows apart — checked within one row's worth of following text, never by
 * which one the model happened to list first.
 */
function findRowIndex(source: string, printedTime: string, description: string): number {
  const normalizedSource = normalizeQuotes(source);
  const normalizedTime = normalizeQuotes(printedTime.trim());
  if (normalizedTime === "") return -1;

  const occurrences = findAllIndices(normalizedSource, normalizedTime);
  if (occurrences.length === 0) return -1;
  if (occurrences.length === 1) return occurrences[0]!;

  const normalizedDescription = normalizeQuotes(description.trim());
  if (normalizedDescription === "") return occurrences[0]!;

  // Prefer an occurrence whose own line (both extractors put one row on one
  // line) also carries this row's description — exact and unambiguous
  // whenever the extraction preserved that structure. This has to be
  // line-scoped, not just "within N characters": two short rows sitting
  // right next to each other (the exact case this function exists for —
  // an avail marker immediately followed by the credit that fills it) can
  // both have their own description fall inside a merely-nearby window of
  // the *other* row's time, which would defeat the disambiguation entirely.
  for (const index of occurrences) {
    const lineEnd = normalizedSource.indexOf("\n", index);
    const line = normalizedSource.slice(index, lineEnd === -1 ? undefined : lineEnd);
    if (line.includes(normalizedDescription)) return index;
  }

  // No occurrence's own line matched — a less strictly line-preserving
  // extraction (real for PDF, see program-log-pdf-text.ts). Fall back to
  // whichever occurrence's nearest description match is closest, not just
  // the first one inside a generous window, for the same reason as above.
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (const index of occurrences) {
    const descriptionIndex = normalizedSource.indexOf(normalizedDescription, index);
    if (descriptionIndex === -1) continue;
    const distance = descriptionIndex - index;
    if (distance <= ROW_WINDOW && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/**
 * "06:06:00" → 21960; "01:30" → 90; "(01:55)" → 115. A two-part value is
 * minutes:seconds, a three-part one is hours:minutes:seconds — matching how
 * the DAD printout uses each column; surrounding parens (an avail window)
 * are stripped first.
 */
export function clockToSeconds(value: string): number {
  const parts = value
    .replace(/[()]/g, "")
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

// ---- Raw model output shape (pre-verification) -----------------------------

export type ParsedEventKind = "program_start" | "content" | "credit" | "avail" | "note";

export interface RawCredit {
  cart: string | null;
  label: string;
  /** One of the underwriter names this call was given, or the literal sentinel "NEW". */
  underwriter: string;
  newUnderwriterName: string | null;
  openingWords: string;
  closingWords: string;
}

export interface RawEvent {
  printedTime: string;
  kind: ParsedEventKind;
  description: string;
  printedLength: string | null;
  credits: RawCredit[];
}

// ---- Verified output shape ---------------------------------------------------

export interface ResolvedCredit {
  cart: string | null;
  label: string;
  underwriterName: string;
  /** Verbatim substring of the source text — never model-generated. */
  script: string;
  durationSeconds: number | null;
}

export interface ParsedLogEvent {
  time: string;
  timeSeconds: number;
  kind: ParsedEventKind;
  description: string;
  lengthSeconds: number | null;
  availDurationSeconds: number | null;
  credits: ResolvedCredit[];
}

export interface VerifiedEvents {
  events: ParsedLogEvent[];
  warnings: string[];
}

/** The AI-parse module's own return shape — defined here (not in that "server-only" module) so program-log-plan.ts can import it without pulling in a network dependency at all. */
export interface ParsedProgramLog {
  airDate: string | null;
  weekday: string | null;
  events: ParsedLogEvent[];
  warnings: string[];
}

const CART_SEARCH_WINDOW = 200;
const LENGTH_SEARCH_WINDOW = 500;

/**
 * Turns the model's raw, unverified event list into confirmed events —
 * dropping anything (a whole event, a whole credit, or just one field of a
 * credit) that doesn't verify against `sourceText`, and recording a warning
 * for each drop so a producer reviewing the import preview sees exactly
 * what wasn't trusted. Each row is located independently by its own time +
 * description (see findRowIndex) rather than by a shared position that
 * advances through the array in order — the array's order is whatever the
 * model happened to emit, never a guarantee that it matches the document's
 * actual top-to-bottom order (a JSON schema constrains each item's shape,
 * not cross-item ordering), and a single shared cursor previously let one
 * row's own confirmed position silently consume a same-timestamped later
 * row's only occurrence in the text. The returned events are sorted by
 * time before being handed back, so nothing downstream needs to trust the
 * model's array order either.
 */
export function verifyAndResolveEvents(rawEvents: RawEvent[], sourceText: string, knownUnderwriterNames: string[]): VerifiedEvents {
  const warnings: string[] = [];
  const events: ParsedLogEvent[] = [];
  const knownNames = new Set(knownUnderwriterNames);

  for (const raw of rawEvents) {
    const printedTime = raw.printedTime.trim();
    if (!TIME_RE.test(printedTime)) {
      warnings.push(`A row with an unrecognized time format ("${raw.printedTime}") was skipped.`);
      continue;
    }
    const rowIndex = findRowIndex(sourceText, printedTime, raw.description);
    if (rowIndex === -1) {
      warnings.push(
        `A row claiming the time ${printedTime} ("${raw.description}") could not be matched to the source text and was skipped.`,
      );
      continue;
    }
    const timeSeconds = clockToSeconds(printedTime);

    let lengthSeconds: number | null = null;
    const printedLength = raw.printedLength?.trim() ?? "";
    if (printedLength !== "" && LENGTH_RE.test(printedLength)) {
      const lengthIndex = findLiteralIndex(sourceText, printedLength, rowIndex);
      if (lengthIndex !== -1 && lengthIndex - rowIndex <= LENGTH_SEARCH_WINDOW) {
        lengthSeconds = clockToSeconds(printedLength);
      }
    }

    const credits: ResolvedCredit[] = [];
    // Within one row, a second (or third) bundled credit's script always
    // follows the previous one in the text — this local cursor keeps them
    // in order without reaching for any other row's position.
    let creditSearchFrom = rowIndex;
    for (const rawCredit of raw.credits) {
      const span = extractVerifiedSpan(sourceText, rawCredit.openingWords, rawCredit.closingWords, creditSearchFrom);
      if (!span) {
        warnings.push(`A credit near ${printedTime} could not be verified against the source text and was skipped — review the export manually.`);
        continue;
      }
      creditSearchFrom = span.endIndex;

      let underwriterName: string;
      if (rawCredit.underwriter === "NEW") {
        const newName = rawCredit.newUnderwriterName?.trim() ?? "";
        if (newName === "") {
          warnings.push(`A new underwriter's credit near ${printedTime} had no name and was skipped.`);
          continue;
        }
        underwriterName = newName;
      } else if (knownNames.has(rawCredit.underwriter)) {
        underwriterName = rawCredit.underwriter;
      } else {
        warnings.push(
          `A credit near ${printedTime} named an underwriter ("${rawCredit.underwriter}") that isn't recognized and was skipped.`,
        );
        continue;
      }

      let cart: string | null = null;
      const rawCart = rawCredit.cart?.trim() ?? "";
      if (rawCart !== "") {
        const cartIndex = findLiteralIndex(sourceText, rawCart, Math.max(0, rowIndex - CART_SEARCH_WINDOW));
        if (cartIndex !== -1 && Math.abs(cartIndex - rowIndex) <= CART_SEARCH_WINDOW) {
          cart = rawCart;
        } else {
          warnings.push(`A cart number near ${printedTime} could not be verified and was dropped from that credit.`);
        }
      }

      credits.push({
        cart,
        label: rawCredit.label.trim() || "Imported copy",
        underwriterName,
        script: span.text,
        // A credit's own duration only ever comes from its own row's printed
        // length (the "credit" kind, one cart-bearing credit per event) —
        // an avail's window duration covers however many cart-less credits
        // share it, never a per-credit figure DAD prints, so those fall
        // through to the planner's own default the same way an unprinted
        // length always has.
        durationSeconds: raw.kind === "credit" ? lengthSeconds : null,
      });
    }

    events.push({
      time: printedTime,
      timeSeconds,
      kind: raw.kind,
      description: raw.description.trim(),
      lengthSeconds,
      availDurationSeconds: raw.kind === "avail" ? lengthSeconds : null,
      credits,
    });
  }

  // Verification no longer depends on array order, but the planner's own
  // segmentation and break-grouping (program-log-plan.ts) walks this list
  // expecting chronological order — never assume the model's own emission
  // order was that, even though it usually is close.
  events.sort((a, b) => a.timeSeconds - b.timeSeconds);

  return { events, warnings };
}
