// What the quote step gives the model and what it may return (docs/sourcework-analysis-
// design.md §5.5): the fixed framing, the theme's evidence with the transcript around it,
// the strict output schema, and the parser that turns an answer into clips. Pure.
//
// As everywhere in this feature the model never types source text or a time. It names
// *sentences* by number, in sources it names by number, and code derives the start and
// end from them — so the clip always begins and ends on the speaker's own word
// boundaries, and the words shown with it are the transcript's, not the model's.
//
// What counts as a good clip (the quote quality guide) is separate language that editors
// own (lib/sourcework/prompts.ts); it is appended to this framing and cannot change the
// shape of the answer.

import { countWords } from "@/lib/text";
import {
  mergeRanges,
  unitIdsForSpan,
  type ExtractionGroup,
  type ExtractionUnit,
  type UnitRange,
  renderUnits,
} from "./extraction-units";
import type { DataPointSpan } from "./research";
import {
  MAX_QUOTES_PER_RUN,
  MAX_QUOTE_MS,
  MIN_QUOTE_MS,
  QUOTE_TIERS,
  parseQuoteTier,
  sameStretch,
  type QuoteStance,
  type QuoteTier,
} from "./quotes";

/** Sentences of transcript shown on either side of a supporting data point's passage. */
export const CONTEXT_UNITS_BEFORE = 4;
export const CONTEXT_UNITS_AFTER = 4;
/** Sentences shown per source, so one long interview cannot crowd the others out. */
export const MAX_UNITS_PER_SOURCE = 360;
/** Supporting data points read per run. */
export const MAX_POINTS_PER_RUN = 60;
export const REASON_MAX = 600;

export const QUOTE_FRAMING = `You choose quotes for a radio reporter. A theme is a claim the project's sources bear out or push against. You are given the theme, the accepted data points that bear on it (short paraphrases, numbered, each marked "supports" or "complicates"), and for each source the transcript around those data points, as numbered sentences under a header naming the speaker and the time.

Choose the clips that would work best on air as actualities, the speaker's own words played in a story. You are not choosing the passages that merely say the most about the theme: a data point is a paraphrase of what someone said, and a clip is a literal cut. Complicating evidence is as useful as supporting evidence: a reporter needs the counterweight, so choose a strong clip from a speaker who complicates the theme over a weaker one that supports it, and do not skip a source because it disagrees. A passage can be a good data point and a poor clip, and the best clip may sit just beside a data point's passage, or cover only part of it.

For each clip, give:
- source_number: which source it is in (the number in its "=== Source N ===" heading).
- first_sentence and last_sentence: the numbers of the first and last sentence in the clip. The clip runs from the start of the first to the end of the last. Every sentence in between must be one you were shown, and all of them must be one speaker's.
- tier: "strong" for a clip you would build a story around, "good" for one you would happily use, "usable" for one that works but is not special.
- why: one or two plain sentences on why it works on air, naming what in the speaker's words does the work and, if relevant, what to watch for (a false start to trim, noise under the opening). Say nothing you cannot see in the words.
- point_numbers: the numbers of the data points the clip exemplifies. Leave it empty if it exemplifies none of them.

Return at most ${MAX_QUOTES_PER_RUN} clips, best first, and fewer if fewer work. Return none if nothing works: a short list of good clips is better than a long one. Do not return two clips that overlap. Never retype or paraphrase the transcript; refer to sentences only by number. The newsroom's editors give their guidance on what makes a clip work below.`;

export interface QuotePointInput {
  /** 1-based across the whole input. */
  number: number;
  claim: string;
  stance: QuoteStance;
  speaker: string | null;
  spans: readonly DataPointSpan[];
}

export interface QuoteSourceInput {
  /** 1-based. */
  number: number;
  title: string;
  units: readonly ExtractionUnit[];
  groups: readonly ExtractionGroup[];
  /** Who speaks each unit (a `tw_speakers` id), for refusing a clip that crosses speakers. */
  speakerByUnit: ReadonlyMap<number, string | null>;
  points: readonly QuotePointInput[];
}

/** The sentences a source's evidence calls for: each passage plus a little on either side, merged. */
export function selectContextUnits(
  units: readonly ExtractionUnit[],
  points: readonly Pick<QuotePointInput, "spans">[],
  options: { before?: number; after?: number; limit?: number } = {},
): ExtractionUnit[] {
  const before = options.before ?? CONTEXT_UNITS_BEFORE;
  const after = options.after ?? CONTEXT_UNITS_AFTER;
  const limit = options.limit ?? MAX_UNITS_PER_SOURCE;
  const indexById = new Map(units.map((unit, index) => [unit.id, index]));

  const ranges: UnitRange[] = [];
  for (const point of points) {
    for (const span of point.spans) {
      const covered = [...unitIdsForSpan(span, units)];
      if (covered.length === 0) continue;
      const indexes = covered.map((id) => indexById.get(id)!).sort((a, b) => a - b);
      const from = Math.max(0, indexes[0]! - before);
      const to = Math.min(units.length - 1, indexes[indexes.length - 1]! + after);
      ranges.push({ from: units[from]!.id, to: units[to]!.id });
    }
  }

  const chosen: ExtractionUnit[] = [];
  for (const range of mergeRanges(ranges)) {
    for (const unit of units) {
      if (unit.id >= range.from && unit.id <= range.to) chosen.push(unit);
    }
  }
  // Past the limit the later passages are left out rather than a middle one cut in half.
  return chosen.length <= limit ? chosen : chosen.slice(0, limit);
}

export function buildQuoteInput(input: {
  themeTitle: string;
  themeDefinition: string;
  sources: readonly (QuoteSourceInput & { shown: readonly ExtractionUnit[] })[];
}): string {
  const parts: string[] = [
    `Theme: ${input.themeTitle}`,
    `What it claims: ${input.themeDefinition}`,
  ];
  for (const source of input.sources) {
    const lines = [`=== Source ${source.number}: ${source.title} ===`];
    lines.push("Data points:");
    for (const point of source.points) {
      lines.push(
        `${point.number}. [${point.stance}] ${point.speaker ? `[${point.speaker}] ` : ""}${point.claim}`,
      );
    }
    lines.push("", "Transcript around them:", renderUnits(source.shown, source.groups));
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

export function buildQuoteOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["quotes"],
    properties: {
      quotes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "source_number",
            "first_sentence",
            "last_sentence",
            "tier",
            "why",
            "point_numbers",
          ],
          properties: {
            source_number: { type: "integer" },
            first_sentence: { type: "integer" },
            last_sentence: { type: "integer" },
            tier: { type: "string", enum: [...QUOTE_TIERS] },
            why: { type: "string" },
            point_numbers: { type: "array", items: { type: "integer" } },
          },
        },
      },
    },
  };
}

export type QuoteDropReason =
  | "unreadable"
  | "unknown_source"
  | "unknown_sentence"
  | "mixed_speakers"
  | "wrong_length"
  | "no_reason"
  | "bad_tier"
  | "duplicate"
  | "over_limit";

export interface ParsedQuote {
  /** Index into the caller's source list. */
  sourceIndex: number;
  startMs: number;
  endMs: number;
  firstUnit: number;
  lastUnit: number;
  tier: QuoteTier;
  why: string;
  /** 0-based indexes into the caller's flat point list, restricted to this source's points. */
  pointIndexes: number[];
  speakerId: string | null;
}

export interface ParsedQuotes {
  quotes: ParsedQuote[];
  dropped: Record<QuoteDropReason, number>;
}

function emptyDropped(): Record<QuoteDropReason, number> {
  return {
    unreadable: 0,
    unknown_source: 0,
    unknown_sentence: 0,
    mixed_speakers: 0,
    wrong_length: 0,
    no_reason: 0,
    bad_tier: 0,
    duplicate: 0,
    over_limit: 0,
  };
}

/**
 * Reads the model's JSON into clips. Anything the code can't stand behind is dropped, not
 * repaired: a sentence the model was never shown, a clip that crosses speakers or is
 * outside the length a quote can be, a missing reason. `shown` is, per source, the units
 * that were actually put in front of the model (a clip may only use those); `pointNumbers`
 * maps a source index to the global point numbers that belong to it.
 */
export function parseQuoteOutput(
  raw: string,
  sources: readonly {
    shown: readonly ExtractionUnit[];
    speakerByUnit: ReadonlyMap<number, string | null>;
    pointNumbers: readonly number[];
  }[],
): ParsedQuotes {
  const dropped = emptyDropped();
  const result: ParsedQuotes = { quotes: [], dropped };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    dropped.unreadable += 1;
    return result;
  }
  const items = (parsed as { quotes?: unknown } | null)?.quotes;
  if (!Array.isArray(items)) {
    dropped.unreadable += 1;
    return result;
  }

  const kept: ParsedQuote[] = [];
  for (const item of items) {
    const row = item as {
      source_number?: unknown;
      first_sentence?: unknown;
      last_sentence?: unknown;
      tier?: unknown;
      why?: unknown;
      point_numbers?: unknown;
    } | null;

    const sourceNumber = row?.source_number;
    if (
      !Number.isInteger(sourceNumber) ||
      (sourceNumber as number) < 1 ||
      (sourceNumber as number) > sources.length
    ) {
      dropped.unknown_source += 1;
      continue;
    }
    const sourceIndex = (sourceNumber as number) - 1;
    const source = sources[sourceIndex]!;

    const tier = parseQuoteTier(row?.tier);
    if (!tier) {
      dropped.bad_tier += 1;
      continue;
    }

    const first = row?.first_sentence;
    const last = row?.last_sentence;
    if (
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      (first as number) > (last as number)
    ) {
      dropped.unknown_sentence += 1;
      continue;
    }
    const shownIds = new Set(source.shown.map((unit) => unit.id));
    const covered = source.shown.filter(
      (unit) => unit.id >= (first as number) && unit.id <= (last as number),
    );
    // Every sentence from the first to the last has to be one the model saw: a clip across a gap
    // would cut two passages together.
    const expected = (last as number) - (first as number) + 1;
    if (
      !shownIds.has(first as number) ||
      !shownIds.has(last as number) ||
      covered.length !== expected
    ) {
      dropped.unknown_sentence += 1;
      continue;
    }

    const speakers = new Set(covered.map((unit) => source.speakerByUnit.get(unit.id) ?? null));
    if (speakers.size > 1) {
      dropped.mixed_speakers += 1;
      continue;
    }

    const startMs = covered[0]!.startMs;
    const endMs = covered[covered.length - 1]!.endMs;
    if (startMs === undefined || endMs === undefined) {
      dropped.unknown_sentence += 1;
      continue;
    }
    const length = endMs - startMs;
    if (length < MIN_QUOTE_MS || length > MAX_QUOTE_MS) {
      dropped.wrong_length += 1;
      continue;
    }

    const why = typeof row?.why === "string" ? row.why.replace(/\s+/g, " ").trim() : "";
    if (why === "") {
      dropped.no_reason += 1;
      continue;
    }

    const allowed = new Set(source.pointNumbers);
    const pointIndexes = [
      ...new Set(
        (Array.isArray(row?.point_numbers) ? row.point_numbers : []).filter(
          (number): number is number => Number.isInteger(number) && allowed.has(number as number),
        ),
      ),
    ].map((number) => number - 1);

    kept.push({
      sourceIndex,
      startMs,
      endMs,
      firstUnit: first as number,
      lastUnit: last as number,
      tier,
      why: why.slice(0, REASON_MAX),
      pointIndexes,
      speakerId: [...speakers][0] ?? null,
    });
  }

  // The model was told not to overlap; if it did, the earlier (higher-ranked) one stays.
  const distinct: ParsedQuote[] = [];
  for (const quote of kept) {
    const twin = distinct.some(
      (other) => other.sourceIndex === quote.sourceIndex && sameStretch(other, quote),
    );
    if (twin) dropped.duplicate += 1;
    else distinct.push(quote);
  }
  if (distinct.length > MAX_QUOTES_PER_RUN) {
    dropped.over_limit += distinct.length - MAX_QUOTES_PER_RUN;
  }
  result.quotes = distinct.slice(0, MAX_QUOTES_PER_RUN);
  return result;
}

/** How many words the model is about to read, for the run's audit counts. */
export function countShownWords(units: readonly ExtractionUnit[]): number {
  return units.reduce((sum, unit) => sum + countWords(unit.text), 0);
}
