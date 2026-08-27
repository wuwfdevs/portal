import "server-only";
import OpenAI from "openai";
import { humanizeOpenAIError } from "@/lib/openai-error";
import { applyCreditScriptBoundaries } from "./credit-script-boundaries";
import { bundledCreditWarning, countCreditIntros } from "./program-log-import";
import type { ParsedProgramLog, ProgramLogEvent } from "./program-log-import";

// Splits a bundled underwriting-credit script — two or more live reads DAD
// printed back to back on one cart-less avail, with no separating marker
// (see CLAUDE.md's program-log-import notes and program-log-import.ts's
// CREDIT_INTRO_RE) — into its separate credits. A fixed-phrase regex can
// only ever catch the phrasings it already knows about (this codebase's own
// test fixtures already carry two different ones: "Support for WUWF comes
// from…" and "…support for WUWF is provided by…"), so it can flag a bundle
// but can't be trusted to find every boundary within one. This module hands
// that judgment to the model instead — but never trusts it to *retype* the
// credit's script. The model's only job is to point at where one credit
// ends and the next begins, by copying a short verbatim opening phrase from
// the source text; applyCreditScriptBoundaries (pure, tested) then locates
// those phrases with plain string search and slices the ORIGINAL text at
// those points. Every returned segment is therefore guaranteed to be an
// exact substring of what DAD printed, never a model paraphrase — the one
// hard requirement for something that becomes a station's on-air script.
//
// Deliberately scoped to the avail/cart-less path only (see
// resolveBundledCreditScripts below) — a bundled *cart-bearing* credit event
// (kind: "credit") stays exactly as before, flagged for manual review, never
// auto-split. That path already has a real cart number and description
// naming one specific advertiser (matched against existing uw_copy by
// program-log-plan.ts's matchCopy), and attaching extra split-out credits to
// it would need a place to put their own attribution this schema doesn't
// have. The avail/cart-less case has no such row to disturb: an extra
// segment just becomes another plain live_read item in the same break,
// exactly like the single-credit case already produces.

// Reuses the same model this repo already uses for structured-output calls
// (editorial-inquiry/ai.ts) rather than guessing at an unverified "cheaper"
// variant name — this call's input is short and the schema is trivial, so
// cost per call is small regardless of tier; a cheaper tier is worth
// revisiting once one is confirmed available, not assumed here.
const MODEL = "gpt-5.6-terra";

const BOUNDARIES_SCHEMA = {
  type: "object",
  properties: {
    opening_words: {
      type: "array",
      description:
        "One entry per credit AFTER the first, in the order they appear. Each entry is the first 6-12 words of that credit's script, copied character-for-character from the source text — same wording, capitalization, and punctuation. Empty if the text is really just one credit.",
      items: { type: "string" },
    },
  },
  required: ["opening_words"],
  additionalProperties: false,
} as const;

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) openaiClient = new OpenAI();
  return openaiClient;
}

/**
 * One call: ask the model where the credits inside `script` split apart,
 * then verify its answer against the source text with
 * applyCreditScriptBoundaries. Returns null on anything unresolved — no key
 * configured, a provider failure, a response that can't be parsed, or
 * boundaries that don't verify — which the caller treats identically to "no
 * split found": the original merged script stands, still flagged by
 * program-log-import.ts's own warning.
 */
async function splitBundledCreditScript(client: OpenAI, script: string): Promise<string[] | null> {
  let response;
  try {
    response = await client.responses.create({
      model: MODEL,
      input: [
        {
          role: "system",
          content:
            "A radio station's underwriting-credit script sometimes has two or more separate credits, for different underwriters, printed back to back with no separator between them. Read the script and decide how many distinct credits it actually contains. For every credit AFTER the first, copy its first 6-12 words exactly as printed — same wording, capitalization, and punctuation, no paraphrasing — so the boundary can be located in the original text. If it's genuinely just one credit, return an empty list.",
        },
        { role: "user", content: script },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "credit_script_boundaries",
          strict: true,
          schema: BOUNDARIES_SCHEMA,
        },
      },
    });
  } catch (error) {
    console.error("Credit script split request failed:", humanizeOpenAIError(error).message);
    return null;
  }

  let openingWords: string[];
  try {
    const parsed = JSON.parse(response.output_text) as { opening_words: string[] };
    openingWords = parsed.opening_words;
  } catch {
    console.error("Credit script split returned unparseable output.");
    return null;
  }

  return applyCreditScriptBoundaries(script, openingWords);
}

/**
 * Attempts a verified split for every bundled avail/cart-less script in a
 * freshly parsed export, returning a new ParsedProgramLog rather than
 * mutating the one passed in. Without OPENAI_API_KEY configured this is a
 * no-op — every bundled script stays exactly as parseProgramLog left it,
 * flagged and merged, same as before this module existed.
 */
export async function resolveBundledCreditScripts(parsed: ParsedProgramLog): Promise<ParsedProgramLog> {
  const client = getOpenAIClient();
  if (!client) return parsed;

  const resolvedWarnings = new Set<string>();
  const events = await Promise.all(
    parsed.events.map(async (event): Promise<ProgramLogEvent> => {
      if (event.kind !== "avail" || event.script === null) return event;
      const introCount = countCreditIntros(event.script);
      if (introCount < 2) return event;

      const segments = await splitBundledCreditScript(client, event.script);
      if (!segments) return event;

      resolvedWarnings.add(bundledCreditWarning(event, introCount));
      return { ...event, script: segments[0]!, extraLiveReadScripts: segments.slice(1) };
    }),
  );

  if (resolvedWarnings.size === 0) return parsed;
  return {
    ...parsed,
    events,
    warnings: parsed.warnings.filter((warning) => !resolvedWarnings.has(warning)),
  };
}
