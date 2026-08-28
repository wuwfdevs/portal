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
 * what wasn't trusted. Events are expected in the same top-to-bottom order
 * the model read them in (the prompt asks for this): a rolling search
 * cursor advances past each confirmed time/credit so a value that recurs
 * often in the document (many rows share the same printed length, many
 * avails share the same window) still resolves to its own, later
 * occurrence rather than snapping back to the first one in the file.
 */
export function verifyAndResolveEvents(rawEvents: RawEvent[], sourceText: string, knownUnderwriterNames: string[]): VerifiedEvents {
  const warnings: string[] = [];
  const events: ParsedLogEvent[] = [];
  const knownNames = new Set(knownUnderwriterNames);
  let cursor = 0;

  for (const raw of rawEvents) {
    const printedTime = raw.printedTime.trim();
    if (!TIME_RE.test(printedTime)) {
      warnings.push(`A row with an unrecognized time format ("${raw.printedTime}") was skipped.`);
      continue;
    }
    const timeIndex = findLiteralIndex(sourceText, printedTime, cursor);
    if (timeIndex === -1) {
      warnings.push(`A row claiming the time ${printedTime} could not be found in the source text and was skipped.`);
      continue;
    }
    cursor = timeIndex + printedTime.length;
    const timeSeconds = clockToSeconds(printedTime);

    let lengthSeconds: number | null = null;
    const printedLength = raw.printedLength?.trim() ?? "";
    if (printedLength !== "" && LENGTH_RE.test(printedLength)) {
      const lengthIndex = findLiteralIndex(sourceText, printedLength, timeIndex);
      if (lengthIndex !== -1 && lengthIndex - timeIndex <= LENGTH_SEARCH_WINDOW) {
        lengthSeconds = clockToSeconds(printedLength);
      }
    }

    const credits: ResolvedCredit[] = [];
    for (const rawCredit of raw.credits) {
      const span = extractVerifiedSpan(sourceText, rawCredit.openingWords, rawCredit.closingWords, cursor);
      if (!span) {
        warnings.push(`A credit near ${printedTime} could not be verified against the source text and was skipped — review the export manually.`);
        continue;
      }
      cursor = span.endIndex;

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
        const cartIndex = findLiteralIndex(sourceText, rawCart, Math.max(0, timeIndex - CART_SEARCH_WINDOW));
        if (cartIndex !== -1 && Math.abs(cartIndex - timeIndex) <= CART_SEARCH_WINDOW) {
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

  return { events, warnings };
}
