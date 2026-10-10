import "server-only";
import OpenAI from "openai";
import { humanizeOpenAIError, isOpenAIRateLimit } from "@/lib/openai-error";
import { parseRetryAfterMs } from "@/lib/openai-retry";
import { backoffDelayMs } from "@/lib/backoff";
import { RESEARCH_MODEL } from "./model";
import { EXTRACTION_FRAMING, buildExtractionOutputSchema } from "./extraction-prompt";

// The extraction model call (docs/sourcework-analysis-design.md §5.2): one
// window of one source in, the model's JSON text out. Nothing here knows what a
// data point is — parsing, checking and writing belong to the caller, so a bad
// answer can never be half-applied.

// Includes reasoning tokens; a window can hold dozens of data points.
const MAX_OUTPUT_TOKENS = 32768;
const MAX_ATTEMPTS = 3;

export type ExtractionCallResult = { ok: true; text: string } | { ok: false; error: string };

/** Runs `call`, retrying a rate limit after the wait the provider suggests (or a backoff), a few times. */
export async function withRateLimitRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (!isOpenAIRateLimit(error) || attempt >= MAX_ATTEMPTS) throw error;
      const hinted = error instanceof Error ? parseRetryAfterMs(error.message) : null;
      const wait = hinted ?? backoffDelayMs(attempt, { baseMs: 2_000, capMs: 20_000 });
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait + 250, 30_000)));
    }
  }
}

export function openAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

export const NOT_CONFIGURED =
  "Research isn't configured yet — OPENAI_API_KEY is not set. Building a piece by hand doesn't need it.";

/**
 * One structured-output call: the fixed framing plus the editors' guide as
 * instructions, the step's input as the message, and the model's JSON text out.
 * Every research step shares it — extraction, and the two theme steps — so the
 * model, the reasoning effort, the retry and the way a refusal or a truncated
 * answer is reported are one implementation. `step` names the step in the
 * messages ("The extraction step ran out of room…").
 */
export async function callStructuredModel(args: {
  step: string;
  schemaName: string;
  schema: Record<string, unknown>;
  framing: string;
  guide: string;
  input: string;
  client?: OpenAI | null;
}): Promise<ExtractionCallResult> {
  const client = args.client ?? openAIClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };

  let response: OpenAI.Responses.Response;
  try {
    response = await withRateLimitRetry(() =>
      client.responses.create({
        model: RESEARCH_MODEL,
        instructions: `${args.framing}\n\n${args.guide}`,
        input: args.input,
        text: {
          format: {
            type: "json_schema",
            name: args.schemaName,
            strict: true,
            schema: args.schema,
          },
        },
        reasoning: { effort: "medium" },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // Stored, as every model call in this portal is (an explicit, portal-wide
        // decision recorded in lib/editorial-inquiry/ai.ts): the OpenAI dashboard
        // only lists stored responses. Interview text going to a third party is
        // already true of ASR; docs/sourcework-analysis-design.md §9 records it.
        store: true,
      }),
    );
  } catch (error) {
    console.error(`Sourcework ${args.step} call failed:`, error);
    return { ok: false, error: humanizeOpenAIError(error).message };
  }

  if (response.status === "failed") {
    return { ok: false, error: response.error?.message ?? `The ${args.step} step failed.` };
  }
  if (response.status === "incomplete") {
    return {
      ok: false,
      error: `The ${args.step} step ran out of room before it finished. Try again; if it keeps happening, there may be unusually much for it to read.`,
    };
  }
  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((part) => part.type === "refusal");
  if (refusal) return { ok: false, error: `The ${args.step} step declined: ${refusal.refusal}` };

  return { ok: true, text: response.output_text };
}

/** One window of one source. */
export function callExtractionModel(args: {
  guide: string;
  input: string;
  client?: OpenAI | null;
}): Promise<ExtractionCallResult> {
  return callStructuredModel({
    step: "extraction",
    schemaName: "data_points",
    schema: buildExtractionOutputSchema(),
    framing: EXTRACTION_FRAMING,
    guide: args.guide,
    input: args.input,
    client: args.client,
  });
}
