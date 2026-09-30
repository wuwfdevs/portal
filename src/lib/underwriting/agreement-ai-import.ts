import "server-only";
// The one model call behind creating a contract from its agreement
// (docs/underwriting-traffic-redesign.md §12): the uploaded agreement or
// insertion order goes to the Responses API as a native file (a PDF, or
// an image for a photographed page — signed originals are often scans,
// which is why this never goes through Sourcework's text extraction), and
// the answer is one strict-schema reading of the order: its facts, its
// flights, and one line per printed instruction in the schedule editor's
// own vocabulary (agreement-import.ts).
//
// No lookup tools: the closed sets the reading needs — the underwriters,
// pools and programs on file — are small enough to ride in the schema as
// enums. The reading is checked by the existing schedule-line parser and
// the schedule step's own reconciliation, not by a verification layer
// here, following the program-log importer's lesson (docs/log-design.md
// §8, 2026-09-22).

import OpenAI from "openai";
import { humanizeOpenAIError, isOpenAIRateLimit } from "@/lib/openai-error";
import { parseRetryAfterMs } from "@/lib/openai-retry";
import {
  buildAgreementOutputSchema,
  isAgreementModelOutput,
  NEW_UNDERWRITER,
  type AgreementModelOutput,
} from "@/lib/underwriting/agreement-import";

// The same model this repo pins for its other structured-output work
// (log/program-log-ai-import.ts, editorial-inquiry/ai.ts).
const MODEL = "gpt-5.6-terra";
// Includes reasoning tokens. An agency grid is the largest answer — a few
// dozen week entries per line — so this leaves room for reasoning over a
// multi-page order and still writing the lines.
const MAX_OUTPUT_TOKENS = 16384;

export type ReadAgreementResult =
  | { ok: true; output: AgreementModelOutput }
  | {
      ok: false;
      error: string;
      /** The provider's rate limit, not the document: worth trying again after `retryAfterMs` (null when it gave no hint). */
      rateLimited?: boolean;
      retryAfterMs?: number | null;
    };

export interface AgreementDocument {
  bytes: Uint8Array;
  filename: string;
  /** application/pdf, image/png, or image/jpeg — what the upload accepts. */
  contentType: string;
}

export interface ReadAgreementInput {
  document: AgreementDocument;
  underwriterNames: string[];
  poolNames: string[];
  programNames: string[];
  /** What the staffer typed on the order step before uploading, if anything — context, not an override (the merge is mergeOrderFacts()). */
  typed: {
    underwriterName: string | null;
    contractIdentifier: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  };
}

const INSTRUCTIONS = `You read a signed radio underwriting agreement or insertion order for WUWF-FM (a public radio station in Pensacola, Florida), uploaded as a document, and express it in the station's traffic tool's own terms. Answer only with the JSON the schema requires.

What an order contains: the underwriter (sponsor) and agency if any; an order or contract number; run dates; a schedule of credits (spots) — one or more instructions, each saying how many credits air, on which days, in which daypart or program, at what time, over which dates; the credit length (usually :30); the total number of spots and the dollar amount; and policy language (affidavits, makegoods, separation, preemption).

The station's vocabulary, which the schema enforces:
- The UNDERWRITER is one of the names on file. Pick the listed name whenever the document is clearly for that business, even if it phrases the name differently ("Autumn Beck Blackledge, Attorneys at Law" is the listed "Autumn Beck Blackledge"). Use "${NEW_UNDERWRITER}" with new_underwriter_name only when the sponsor is genuinely not on the list.
- A LINE is one printed instruction. Keep the order's own granularity — "Wednesday and Thursday ~8:06am x 26 weeks" is one line with two eligible days, not two lines. A line that changes rule part-way through the run ("3 a week Feb 16–Apr 26, then 2 a week Apr 27–Nov 29") is two lines with their own dates.
- entry_kind says how the order sells the credits. fixed_days: a set count on each listed weekday ("Monday ~7:49am x 26 weeks" is fixed_days, count_per_day 1, days [1]). weekly_quota: N a week on any of the eligible days ("3 spots each week Mon–Sun", "2 Drive Time spots each week"). monthly_quota: N a calendar month. every_n_weeks: N in one week out of every interval. explicit_dates: the order lists the dates. week_grid: an agency grid with a quantity per week column — give every column, zeros for dark weeks, keyed by each week's Monday. range_total: N over the whole run with no per-period rule ("52 spots any time this year").
- pool is the station's inventory class the order sells, chosen from the listed names only. program is a specific program the order names, from the listed names only. Give one or the other (both only when the order names a program inside a pool). Orders rarely print the station's names exactly; map their wording onto the list:
  - A daypart the order names generally ("Drive Time", "AM Drive", "Weekend Edition") is the listed pool or program that covers it. When the order offers a choice ("Drive Time" meaning AM or PM drive, "either Sat. or Sun. Weekend Edition"), use the one listed pool that covers every choice. Never split an either/or instruction into several lines: one line owes the order's quantity wherever it can run.
  - When the order names no pool, program, or daypart ("one spot per day between 5 a.m. and 9:58 p.m.", "run of schedule", "ROS", "any time"), the pool is Total Program Rotation — the station's anywhere pool — and the time rule does the narrowing.
  - "Rotating" between two dayparts or programs ("1 Rotating AM/PM Drive" a week) alternates week by week: two every_n_weeks lines with interval_weeks 2, one for each, each with the order's weekly count, the second starting one week after the first.
  - A branded product the station sells ("Learning Minute", "EcoMinute", a named feature) is a kind of credit, not a pool or program. Its line takes the order's day and time (exact for "Wednesday 7:19 am") and the pool or program the order names, or Total Program Rotation when it names none; put the product's name in the label.
  - Split an instruction into several lines only when the order itself splits the quantity ("3 per week: 1 Living on Earth, 1 Rotating AM/PM Drive, 1 Science Friday" is three instructions).
  - Never make up a pool or program name. Pick from the list, or leave the instruction unresolved when nothing on the list can cover it.
- time_mode: window for "between 6a and 10a"; preferred for "~7:49am" or "around"; exact for "@ 8:19 AM" or a named feature at a fixed time; opening / closing for the program's first or last credit; any otherwise. Times are 24-hour HH:MM.
- days_of_week uses 0 = Sunday … 6 = Saturday. For fixed_days it is the days the credit airs. For other kinds it is the days the order restricts to ("Mon–Fri" → [1,2,3,4,5]); empty means any day.
- service_level is bonus only when the order marks the line bonus, no-charge, or $0.
- stated_total is the order's own printed count for that line; never compute one.
- source_text is the order's own wording for the line, copied verbatim.
- Dates are YYYY-MM-DD. An order that prints dates without a year takes the year from its run dates. A line with no dates of its own runs the order's full run.
- flights: only for an order organised around events or productions with their own dates and spots (a symphony season, a theatre's productions). Name each once in flights and put its name on its lines. Otherwise leave flights empty and every line's flight null.

What WUWF files for a direct sponsor is usually a packet: the one-page WUWF Sponsorship Agreement (sponsor, dates, sponsorship total, a "Spot Schedule" line such as "Carpools: 26 weeks each: Mon 7:49 am; Tues 4:48 pm; Wed 8:06 am; Thurs 8:06 am", and the standard comments on preemption and adjacency), then WUWF's own internal Insertion Order restating the schedule with its total ("Total: 104 spots", "1 spot each week for 26 weeks in: Carpool: Mon 7:49 am; …", "Affidavits Needed - NO"), then the traffic system's contract printout (one row per line with a day mask like 0,1,0,0,0,0,0 for Sun..Sat, a four-minute window such as 07:47:00-07:51:00, and a quantity). Read all three as one order: the agreement and insertion order are the instruction — a time printed as "7:49 am" is a preferred time, and the printout's four-minute window is how the traffic system booked that same time, not a window rule — and the printout's quantities and day masks confirm the counts and days. An agency client's insertion order is the agency's own form (weeks, days, a time range, cost, spots per week, a list of the weeks the schedule repeats): a time range there is a window rule, and a list of repeating weeks is a week grid with the missing weeks at zero.

Transcribe; do not correct. If the order says "Oct. 3, Friday" and Oct. 3 is a Saturday, keep the date the order prints and say so in notes. If the order's per-line counts don't add to its total, keep the printed numbers and say so in notes. If the document prints the credit copy (the script), mention that in notes — copy is entered elsewhere.

Order-level facts go in order: the sponsor, the order number (null when the document prints none — never compose one), run dates, what is sponsored, total spots, the dollar total, whether affidavits are needed, whether makegoods need agency approval, the separation instruction verbatim (FPM prints a bare "3" — keep it as "3"), and preemption / rescheduling language verbatim. Null for anything the document doesn't state.

unresolved is for what isn't a schedule of broadcast credits — app or website ads, print ads, tickets, event mentions, logos — and for an instruction with no quantity at all or a vague "as available". Give its wording and the reason. Reading ordinary wording onto the station's list as described above is not guessing; inventing a name, a quantity, or a time the order doesn't state is.`;

function dataUrl(document: AgreementDocument): string {
  return `data:${document.contentType};base64,${Buffer.from(document.bytes).toString("base64")}`;
}

function documentPart(document: AgreementDocument): OpenAI.Responses.ResponseInputContent {
  if (document.contentType === "application/pdf") {
    return { type: "input_file", filename: document.filename, file_data: dataUrl(document) };
  }
  return { type: "input_image", image_url: dataUrl(document), detail: "high" };
}

function list(label: string, names: string[], whenEmpty: string): string {
  return names.length > 0 ? `${label}:\n${names.map((name) => `- ${name}`).join("\n")}` : whenEmpty;
}

export async function readAgreementWithAI(input: ReadAgreementInput): Promise<ReadAgreementResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Reading agreements isn't configured yet — OPENAI_API_KEY is not set.",
    };
  }

  const client = new OpenAI({ apiKey });
  const typedFacts = [
    input.typed.underwriterName ? `underwriter ${input.typed.underwriterName}` : null,
    input.typed.contractIdentifier ? `order number ${input.typed.contractIdentifier}` : null,
    input.typed.effectiveFrom ? `runs from ${input.typed.effectiveFrom}` : null,
    input.typed.effectiveTo ? `runs to ${input.typed.effectiveTo}` : null,
  ].filter((fact): fact is string => fact !== null);
  const contextText = [
    typedFacts.length > 0
      ? `The staffer entered these before uploading (the document's own statements still go in order): ${typedFacts.join("; ")}.`
      : "Nothing was entered before uploading; the document is the only source.",
    list(
      "Underwriters on file",
      input.underwriterNames,
      `No underwriters are on file yet — the underwriter is ${NEW_UNDERWRITER}.`,
    ),
    list(
      "Inventory pools on file",
      input.poolNames,
      "No inventory pools are on file yet — every line's pool is null.",
    ),
    list(
      "Programs on file",
      input.programNames,
      "No programs are on file yet — every line's program is null.",
    ),
  ].join("\n\n");

  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create({
      model: MODEL,
      instructions: INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [documentPart(input.document), { type: "input_text", text: contextText }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "agreement_reading",
          strict: true,
          schema: buildAgreementOutputSchema({
            underwriterNames: input.underwriterNames,
            poolNames: input.poolNames,
            programNames: input.programNames,
          }),
        },
      },
      reasoning: { effort: "medium" },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    });
  } catch (error) {
    console.error("Agreement reading OpenAI call failed:", error);
    if (isOpenAIRateLimit(error))
      return {
        ok: false,
        error: humanizeOpenAIError(error).message,
        rateLimited: true,
        retryAfterMs: parseRetryAfterMs((error as Error).message),
      };
    return { ok: false, error: humanizeOpenAIError(error).message };
  }

  if (response.status === "failed") {
    return { ok: false, error: response.error?.message ?? "The AI reading step failed." };
  }
  if (response.status === "incomplete") {
    return {
      ok: false,
      error:
        "The AI reading step ran out of output room before finishing — try again, or enter the contract by hand.",
    };
  }

  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((part) => part.type === "refusal");
  if (refusal) return { ok: false, error: `The AI reading step declined: ${refusal.refusal}` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    return { ok: false, error: "The AI reading step returned an answer that couldn't be read." };
  }
  if (!isAgreementModelOutput(parsed)) {
    return { ok: false, error: "The AI reading step returned an answer that couldn't be read." };
  }
  return { ok: true, output: parsed };
}
