import "server-only";
// The program-log importer's one model call — the whole interpretation of
// the uploaded PDF, from "which row is a program start" to "which existing
// copy is this credit", is the model's, returned as one strict-schema plan
// (program-log-plan.ts's ProgramLogModelOutput). The PDF goes to the
// Responses API as a native file input, so the model reads the real page
// layout (columns, page breaks, a script continuing onto the next page)
// rather than a text dump, and no per-format parser exists: a different
// traffic system's export is a different-looking PDF, not new code.
//
// Context stays small on purpose. The prompt carries the instructions and
// the underwriter names (the closed set the output schema's enum enforces);
// everything else — the date's schedule, an underwriter's existing copy,
// content-library candidates for a fill — arrives through the function
// tools in program-log-lookups.ts, sized to what the document mentions.
// Rounds chain through previous_response_id so the PDF is sent once.
//
// There is no verification, matching, or dedup layer between the model's
// plan and the preview (see docs/log-design.md §8's 2026-09-22 revision):
// the preview lists every break and item, and a host confirms.

import OpenAI from "openai";
import { humanizeOpenAIError } from "@/lib/openai-error";
import { buildPlanOutputSchema, type ProgramLogModelOutput } from "@/lib/log/program-log-plan";
import {
  buildImportTools,
  runImportLookup,
  type ImportLookupData,
} from "@/lib/log/program-log-lookups";

// The same model this repo pins for its other structured-output and
// tool-calling work (editorial-inquiry/ai.ts).
const MODEL = "gpt-5.6-terra";
// Includes reasoning tokens. A full day's plan is several thousand tokens
// of JSON on its own; sized so reasoning over a dozen tool results still
// leaves room to write it.
const MAX_OUTPUT_TOKENS = 32768;
// Tool calls batch (parallel_tool_calls), so a real import takes two or
// three rounds: schedule, then copy/content lookups, then the plan.
const MAX_ROUNDS = 8;

export type ImportProgramLogResult =
  { ok: true; output: ProgramLogModelOutput; toolCalls: number } | { ok: false; error: string };

const INSTRUCTIONS = `You turn a radio station's daily program log — a traffic/automation system's printout of what is scheduled to air, uploaded as a PDF — into a structured import plan for WUWF-FM's Log tool. Read the whole document, use the tools to look up what you need, then answer with the plan in the required JSON shape.

What a program log contains, in general: rows in broadcast order, each with a scheduled time, sometimes a cart (cut) number, a description, and a length. Some rows start a program (the program's name, usually at the top of an hour). Some mark an underwriting break — a window of a given length that credits are scheduled into. Some are the credits themselves: an underwriter name plus a copy label, often with a cart number, followed by the live-read script. Some are other local fills: a promo, a short feature, a station ID. Some are operational reminders for the host (meter readings, fader cues). Formats differ between traffic systems; read the layout you are given.

WUWF's current export (DAD) looks like this: columns Time | Cart # | Description | Length. A "UW Credit (mm:ss)" row is a break marker with its window. A cart-bearing credit prints as "Underwriter / Copy label" with its cart number and length, and its script prints on the following row — sometimes carried past a page break, where the printout repeats its title row, column headings, and a "Printed … Page n of m" footer in the middle of the script; those repeated rows are not content. A cart-less credit prints its script directly on or right after the marker row, or right after another credit's script with nothing separating them — read the content and count how many distinct advertisers are really there; one advertiser's script that mentions WUWF twice is still one credit. A lone mm:ss value on its own line after a script is a length column value, not content. Program starts are rows naming a program at or near the top of an hour (sometimes with a cart number for an automation cut, like "88 BBC World Service"); other fills are rows naming a specific piece of content (a promo, a short feature). A row like "Play thru ENCO Fader" or "Take Meter Readings" is an operational note.

How to build the plan:
1. Read the air date from the title row and call ${"schedule_for_date"} with it. Every rundown you return must use a schedule_entry_id from that result. A program in the log that is not on that date's schedule goes in unresolved, with its rows left out.
2. Make one rundown per program on the schedule, and inside it one break per break marker or standalone fill, at the printed time, with the marker's window in window_seconds.
3. Every printed credit or fill is exactly one item in exactly one break — never listed twice, never split across breaks. A credit whose cart row sits inside a marker's window belongs to that marker's break.
4. Underwriters are a closed set: the names listed below. Pick the listed name whenever a credit is clearly for that business, even if the script phrases the name differently. Use "NEW" with new_underwriter_name only when the advertiser is genuinely not on the list.
5. For each underwriter whose credit appears, call ${"list_copy_for_underwriter"} once and set existing_copy_id when the credit is the same message as a listed copy — the same cart, or the same label and the same message. Otherwise leave it null (new copy).
6. Copy every script character for character from the document: same words, capitalization, and punctuation, nothing paraphrased or summarized. Include the whole script, across a page break if it continues.
7. For a non-credit fill, call ${"search_content_items"} with its printed description. Use kind "content" with a returned content_item_id only when the match is clearly the same piece; otherwise kind "live_read" with the printed description as its title.
8. Operational reminders go in notes. Anything you cannot place with confidence goes in unresolved with a reason — do not guess.

Answer only with the JSON plan.`;

export interface ImportProgramLogInput {
  pdf: Uint8Array;
  filename: string;
  data: ImportLookupData;
}

export async function importProgramLogWithAI(
  input: ImportProgramLogInput,
): Promise<ImportProgramLogResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "The program-log importer isn't configured yet — OPENAI_API_KEY is not set.",
    };
  }

  const client = new OpenAI({ apiKey });
  const underwriterNames = input.data.underwriters.map((row) => row.name);
  const shared = {
    model: MODEL,
    instructions: INSTRUCTIONS,
    tools: buildImportTools(),
    tool_choice: "auto" as const,
    parallel_tool_calls: true,
    text: {
      format: {
        type: "json_schema" as const,
        name: "program_log_plan",
        strict: true,
        schema: buildPlanOutputSchema(underwriterNames),
      },
    },
    reasoning: { effort: "medium" as const },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: true,
  };

  const firstInput: OpenAI.Responses.ResponseInputItem[] = [
    {
      role: "user",
      content: [
        {
          type: "input_file",
          filename: input.filename,
          file_data: `data:application/pdf;base64,${Buffer.from(input.pdf).toString("base64")}`,
        },
        {
          type: "input_text",
          text:
            underwriterNames.length > 0
              ? `Underwriters on file:\n${underwriterNames.map((name) => `- ${name}`).join("\n")}`
              : "No underwriters are on file yet — every credit's underwriter is NEW.",
        },
      ],
    },
  ];

  let toolCalls = 0;
  let previousResponseId: string | null = null;
  let nextInput = firstInput;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let response: OpenAI.Responses.Response;
    try {
      response = await client.responses.create({
        ...shared,
        input: nextInput,
        ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      });
    } catch (error) {
      console.error("Program-log import OpenAI call failed:", error);
      return { ok: false, error: humanizeOpenAIError(error).message };
    }

    if (response.status === "failed") {
      return { ok: false, error: response.error?.message ?? "The importer's AI step failed." };
    }
    if (response.status === "incomplete") {
      return {
        ok: false,
        error:
          "The importer's AI step ran out of output room before finishing the plan — try again, or import a shorter export.",
      };
    }

    const calls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
    );
    if (calls.length === 0) {
      return parseFinalOutput(response, toolCalls);
    }

    toolCalls += calls.length;
    previousResponseId = response.id;
    nextInput = calls.map((call) => ({
      type: "function_call_output",
      call_id: call.call_id,
      output: runImportLookup(call.name, call.arguments, input.data),
    }));
  }

  return {
    ok: false,
    error: "The importer's AI step kept looking things up without finishing the plan — try again.",
  };
}

function parseFinalOutput(
  response: OpenAI.Responses.Response,
  toolCalls: number,
): ImportProgramLogResult {
  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((part) => part.type === "refusal");
  if (refusal) return { ok: false, error: `The importer's AI step declined: ${refusal.refusal}` };

  let parsed: ProgramLogModelOutput;
  try {
    parsed = JSON.parse(response.output_text) as ProgramLogModelOutput;
  } catch {
    return { ok: false, error: "The importer's AI step returned a plan that couldn't be read." };
  }
  if (
    !parsed ||
    !Array.isArray(parsed.rundowns) ||
    !Array.isArray(parsed.unresolved) ||
    !Array.isArray(parsed.notes)
  ) {
    return { ok: false, error: "The importer's AI step returned a plan that couldn't be read." };
  }
  return { ok: true, output: parsed, toolCalls };
}
