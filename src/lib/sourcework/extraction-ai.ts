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

/** One window: the framing plus the editors' guide as instructions, the source as input. */
export async function callExtractionModel(args: {
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
        instructions: `${EXTRACTION_FRAMING}\n\n${args.guide}`,
        input: args.input,
        text: {
          format: {
            type: "json_schema",
            name: "data_points",
            strict: true,
            schema: buildExtractionOutputSchema(),
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
    console.error("Sourcework extraction call failed:", error);
    return { ok: false, error: humanizeOpenAIError(error).message };
  }

  if (response.status === "failed") {
    return { ok: false, error: response.error?.message ?? "The extraction step failed." };
  }
  if (response.status === "incomplete") {
    return {
      ok: false,
      error:
        "The extraction step ran out of room before it finished this part of the source. Try again; if it keeps happening, the source may be unusually dense.",
    };
  }
  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((part) => part.type === "refusal");
  if (refusal) return { ok: false, error: `The extraction step declined: ${refusal.refusal}` };

  return { ok: true, text: response.output_text };
}
