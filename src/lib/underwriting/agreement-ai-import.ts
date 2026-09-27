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
import { humanizeOpenAIError } from "@/lib/openai-error";
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
  { ok: true; output: AgreementModelOutput } | { ok: false; error: string };

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
- pool is the station's inventory class the order sells — AM Drive, PM Drive, Carpool, Total Program Rotation (also printed TPR or ROS), Mid-day, Weekend Edition and the like — chosen from the listed names only. program is a specific program the order names, from the listed names only. Give one or the other (both only when the order names a program inside a pool). Never invent a name: if the order sells something not on either list, put the instruction in unresolved.
- time_mode: window for "between 6a and 10a"; preferred for "~7:49am" or "around"; exact for "@ 8:19 AM" or a named feature at a fixed time; opening / closing for the program's first or last credit; any otherwise. Times are 24-hour HH:MM.
- days_of_week uses 0 = Sunday … 6 = Saturday. For fixed_days it is the days the credit airs. For other kinds it is the days the order restricts to ("Mon–Fri" → [1,2,3,4,5]); empty means any day.
- service_level is bonus only when the order marks the line bonus, no-charge, or $0.
- stated_total is the order's own printed count for that line; never compute one.
- source_text is the order's own wording for the line, copied verbatim.
- Dates are YYYY-MM-DD. An order that prints dates without a year takes the year from its run dates. A line with no dates of its own runs the order's full run.
- flights: only for an order organised around events or productions with their own dates and spots (a symphony season, a theatre's productions). Name each once in flights and put its name on its lines. Otherwise leave flights empty and every line's flight null.

What WUWF files for a direct sponsor is usually a packet: the one-page WUWF Sponsorship Agreement (sponsor, dates, sponsorship total, a "Spot Schedule" line such as "Carpools: 26 weeks each: Mon 7:49 am; Tues 4:48 pm; Wed 8:06 am; Thurs 8:06 am", and the standard comments on preemption and adjacency), then WUWF's own internal Insertion Order restating the schedule with its total ("Total: 104 spots", "1 spot each week for 26 weeks in: Carpool: Mon 7:49 am; …", "Affidavits Needed - NO"), then the traffic system's contract printout (one row per line with a day mask like 0,1,0,0,0,0,0 for Sun..Sat, a four-minute window such as 07:47:00-07:51:00, and a quantity). Read all three as one order: the agreement and insertion order are the instruction — a time printed as "7:49 am" is a preferred time, and the printout's four-minute window is how the traffic system booked that same time, not a window rule — and the printout's quantities and day masks confirm the counts and days. An agency client's insertion order is the agency's own form (weeks, days, a time range, cost, spots per week, a list of the weeks the schedule repeats): a time range there is a window rule, and a list of repeating weeks is a week grid with the missing weeks at zero.

Transcribe; do not correct. If the order says "Oct. 3, Friday" and Oct. 3 is a Saturday, keep the date the order prints and say so in notes. If the order's per-line counts don't add to its total, keep the printed numbers and say so in notes. If the document prints the credit copy (the script), mention that in notes — copy is entered elsewhere.

Order-level facts go in order: the sponsor, the order number, run dates, what is sponsored, total spots, the dollar total, whether affidavits are needed, whether makegoods need agency approval, the separation instruction verbatim (FPM prints a bare "3" — keep it as "3"), and preemption / rescheduling language verbatim. Null for anything the document doesn't state.

An instruction you cannot express — no quantity, a vague "as available", a daypart not on the pool list — goes in unresolved with its wording and the reason. Do not guess.`;

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
