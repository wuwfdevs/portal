import "server-only";
// The program-log import's structural + credit parsing — replaces the old
// program-log-import.ts's hand-rolled row classifier entirely. Text
// extraction stays deterministic and format-specific (program-log-docx-
// text.ts, program-log-pdf-text.ts) because getting characters out of a
// container format is a low-risk, mechanical operation; everything about
// *interpreting* those characters — which row is a program start vs. an
// ordinary fill vs. an avail marker, how many underwriting credits are
// bundled into one script, who each one is for — is real judgment a fixed
// pattern can't reliably make (see this file's own history in CLAUDE.md).
// This module hands that judgment to the model, one call per import, and
// verifies every checkable claim it makes against the extracted text before
// trusting it (program-log-verification.ts does the actual verification —
// this file is the thin network-call wrapper around it, same split as
// editorial-inquiry/ai.ts vs. tree.ts).
//
// The one thing the model is never trusted to do is retype content: every
// credit's script is a verbatim substring of the source text, located by
// the model's own opening/closing-phrase pointers and sliced by code, never
// generated. Underwriter attribution is a closed-set pick (the existing
// underwriters, as a schema enum) plus an explicit "NEW" escape hatch — not
// free-text matched after the fact — so the model can recognize "Autumn
// Beck Blackledge, Attorneys of Divorce and Family Law" as the known
// underwriter "Autumn Beck Blackledge" without this code needing its own
// fuzzy-matching heuristic, and without risking a wording-drift duplicate
// the way matching two independently-extracted free-text names would.

import OpenAI from "openai";
import { humanizeOpenAIError } from "@/lib/openai-error";
import { deriveAirDate } from "./program-log-air-date";
import {
  verifyAndResolveEvents,
  type ParsedProgramLog,
  type RawCredit,
  type RawEvent,
} from "./program-log-verification";

export type { ParsedProgramLog } from "./program-log-verification";
export type ParseProgramLogResult = { ok: true; parsed: ParsedProgramLog } | { ok: false; error: string };

// Reuses the same model this repo already uses for structured-output calls
// (editorial-inquiry/ai.ts) rather than guessing at an unverified "cheaper"
// variant name.
const MODEL = "gpt-5.6-terra";
const NEW_UNDERWRITER = "NEW";

const SYSTEM_PROMPT = `You read a WUWF-FM radio station's daily program log, exported from its DAD traffic system as plain text, and turn it into a structured list of events.

Format notes about this export:
- Each line is one printed row, columns joined by " | " (Time | Cart # | Description | Length), in the order they appear on the page. A line with just one or two fields is a title/header/footer row, an avail marker, or a live-read script line — not every row has every column.
- A "UW Credit (mm:ss)" line is an avail marker: a scheduled underwriting break and its total window. It is not itself a credit.
- A line with a Cart # and a Description is a scheduled item. If a live-read script for it follows on the next line(s), it's an underwriting credit for that cart.
- A live-read script can also print directly after (or on) an avail marker with no cart number of its own — a cart-less credit. Two or more of these are sometimes printed back to back with nothing separating them: read the actual content carefully and count how many distinct advertisers' credits are really there, even when the export gives you no visual break between them. A script that just mentions "WUWF" or repeats a phrase within describing ONE advertiser is still one credit, not several — only split when the content genuinely changes to a different underwriter.
- Rows with no cart number and no live-read script are either a program start (a row naming a program by name, typically at or near the top of an hour) or an ordinary content fill (a promo, feature, or similar) — you can tell the difference from context: a name you'd recognize as a radio program (e.g. "Morning Edition", "BBC World Service") versus a specific piece of content ("Birdnote Daily", "Unearthing Florida").
- Operational reminders ("Take Meter Readings", a fader cue) are notes, not schedulable content.

For every row, report:
- printed_time: the time exactly as printed for that row.
- kind: "program_start" | "content" | "credit" | "avail" | "note".
- description: the row's own printed description/title text.
- printed_length: the row's printed Length column value, or the avail's own parenthesized window (e.g. "(01:55)"), exactly as printed. Null if nothing is printed for this row.
- credits: the underwriting credits scheduled on or immediately after this row. Always empty for program_start/content/note. Exactly one for "credit". Zero or more for "avail".

For each credit, report:
- cart: that credit's own DAD cart number if it has one printed on its row, else null.
- label: a short label — from the row's own description after a " / " (e.g. "Copy 1"), or "Live read" for a cart-less credit with no such label.
- underwriter: pick the exact matching name from the provided list if this credit is clearly for an underwriter already on it (even if the script phrases the business name slightly differently than the list — match by who it's actually for), otherwise the literal value "${NEW_UNDERWRITER}".
- new_underwriter_name: required (non-null) only when underwriter is "${NEW_UNDERWRITER}" — the advertiser's name as best identified from the script. Null otherwise.
- opening_words: the first 6-12 words of this credit's own script, copied character-for-character from the document — same wording, capitalization, and punctuation, no paraphrasing.
- closing_words: the last 6-12 words of this credit's own script, copied character-for-character from the document, ending exactly where this credit's script ends (and the next one, if any, begins).

List events in the same top-to-bottom order they appear in the document. Every opening_words/closing_words phrase must be copied exactly as printed — they're used to locate the credit's real text afterward, so an approximate or reworded phrase will fail to match.`;

function buildEventsSchema(underwriterNames: string[]) {
  const underwriterEnum = [...underwriterNames, NEW_UNDERWRITER];
  return {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            printed_time: { type: "string" },
            kind: { type: "string", enum: ["program_start", "content", "credit", "avail", "note"] },
            description: { type: "string" },
            printed_length: { type: ["string", "null"] },
            credits: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cart: { type: ["string", "null"] },
                  label: { type: "string" },
                  underwriter: { type: "string", enum: underwriterEnum },
                  new_underwriter_name: { type: ["string", "null"] },
                  opening_words: { type: "string" },
                  closing_words: { type: "string" },
                },
                required: ["cart", "label", "underwriter", "new_underwriter_name", "opening_words", "closing_words"],
                additionalProperties: false,
              },
            },
          },
          required: ["printed_time", "kind", "description", "printed_length", "credits"],
          additionalProperties: false,
        },
      },
    },
    required: ["events"],
    additionalProperties: false,
  } as const;
}

interface RawResponseCredit {
  cart: string | null;
  label: string;
  underwriter: string;
  new_underwriter_name: string | null;
  opening_words: string;
  closing_words: string;
}

interface RawResponseEvent {
  printed_time: string;
  kind: RawEvent["kind"];
  description: string;
  printed_length: string | null;
  credits: RawResponseCredit[];
}

function toRawCredit(credit: RawResponseCredit): RawCredit {
  return {
    cart: credit.cart,
    label: credit.label,
    underwriter: credit.underwriter,
    newUnderwriterName: credit.new_underwriter_name,
    openingWords: credit.opening_words,
    closingWords: credit.closing_words,
  };
}

function toRawEvent(event: RawResponseEvent): RawEvent {
  return {
    printedTime: event.printed_time,
    kind: event.kind,
    description: event.description,
    printedLength: event.printed_length,
    credits: event.credits.map(toRawCredit),
  };
}

export async function parseProgramLogWithAI(
  sourceText: string,
  underwriterNames: string[],
): Promise<ParseProgramLogResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "The program-log importer isn't configured yet — OPENAI_API_KEY is not set.",
    };
  }

  const client = new OpenAI({ apiKey });
  let response;
  try {
    response = await client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: sourceText },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "program_log_events",
          strict: true,
          schema: buildEventsSchema(underwriterNames),
        },
      },
    });
  } catch (error) {
    return { ok: false, error: humanizeOpenAIError(error).message };
  }

  let rawEvents: RawResponseEvent[];
  try {
    const parsed = JSON.parse(response.output_text) as { events: RawResponseEvent[] };
    rawEvents = parsed.events;
  } catch {
    return { ok: false, error: "The importer's AI step returned a response that couldn't be read." };
  }

  const { airDate, weekday, warnings: dateWarnings } = deriveAirDate(sourceText);
  const { events, warnings: verificationWarnings } = verifyAndResolveEvents(
    rawEvents.map(toRawEvent),
    sourceText,
    underwriterNames,
  );

  const warnings = [...dateWarnings, ...verificationWarnings];
  if (airDate === null) warnings.push("No 'WUWF-FM Program Log' title row was found, so the air date is unknown.");
  if (events.length === 0) warnings.push("No usable rows were found in this document.");

  return { ok: true, parsed: { airDate, weekday, events, warnings } };
}
