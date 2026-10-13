import "server-only";
import type OpenAI from "openai";
import { humanizeOpenAIError } from "@/lib/openai-error";
import { RESEARCH_MODEL } from "./model";
import { NOT_CONFIGURED, openAIClient, withRateLimitRetry } from "./extraction-ai";
import { collectQueries, collectSeenUrls } from "./context-ai";
import { ANALYZE_FRAMING, buildAnalyzeOutputSchema } from "./analyze-prompt";

// The Analyze model call (docs/sourcework-analysis-design.md §20): one window of one source in, the
// model's JSON out, with OpenAI's built-in web search available for the model to use when it needs
// context to read the source. Nothing here knows what a finding is; parsing, checking and writing
// belong to the caller, so a bad answer can never be half-applied.
//
// Search is the model's call: `tool_choice: "auto"`, no list of subjects to look up. The searches it
// made and the pages it was shown come back so the run row can record them, and so a "consulted" page
// the model claims can be checked against what the tool actually returned.

// Includes reasoning tokens and any searching; a window can hold dozens of findings.
const MAX_OUTPUT_TOKENS = 32768;
/** A ceiling on searching per window, not a target. */
const MAX_WEB_SEARCHES = 8;

export type AnalyzeCallResult =
  | { ok: true; text: string; seenUrls: Set<string>; queries: string[] }
  | { ok: false; error: string };

export async function callAnalyzeModel(args: {
  guide: string;
  input: string;
  client?: OpenAI | null;
}): Promise<AnalyzeCallResult> {
  const client = args.client ?? openAIClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };

  let response: OpenAI.Responses.Response;
  try {
    // stream() + finalResponse(), as the background call does: it is the shape the SDK's types give
    // max_tool_calls to, and a searching turn runs long enough that a streamed connection is safer.
    response = await withRateLimitRetry(() =>
      client.responses
        .stream({
          model: RESEARCH_MODEL,
          instructions: `${ANALYZE_FRAMING}\n\n${args.guide}`,
          input: args.input,
          text: {
            format: {
              type: "json_schema",
              name: "analysis",
              strict: true,
              schema: buildAnalyzeOutputSchema(),
            },
          },
          tools: [
            {
              type: "web_search",
              // Context to read a source with, not a research report: a slice of each result is plenty.
              search_context_size: "low",
              user_location: {
                type: "approximate",
                city: "Pensacola",
                region: "Florida",
                country: "US",
                timezone: "America/Chicago",
              },
            },
          ],
          tool_choice: "auto",
          include: ["web_search_call.action.sources"],
          max_tool_calls: MAX_WEB_SEARCHES,
          reasoning: { effort: "medium" },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: true,
        })
        .finalResponse(),
    );
  } catch (error) {
    console.error("Sourcework analyze call failed:", error);
    return { ok: false, error: humanizeOpenAIError(error).message };
  }

  if (response.status === "failed") {
    return { ok: false, error: response.error?.message ?? "The analysis step failed." };
  }
  if (response.status === "incomplete") {
    return {
      ok: false,
      error:
        "The analysis step ran out of room before it finished. Try again; if it keeps happening, there may be unusually much for it to read.",
    };
  }
  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((part) => part.type === "refusal");
  if (refusal) return { ok: false, error: `The analysis step declined: ${refusal.refusal}` };

  return {
    ok: true,
    text: response.output_text,
    seenUrls: collectSeenUrls(response),
    queries: collectQueries(response),
  };
}
