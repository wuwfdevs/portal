import "server-only";
import type OpenAI from "openai";
import { humanizeOpenAIError } from "@/lib/openai-error";
import { RESEARCH_MODEL } from "./model";
import { NOT_CONFIGURED, openAIClient, withRateLimitRetry } from "./extraction-ai";
import {
  CONTEXT_FRAMING,
  MAX_CONTEXT_NOTES,
  buildContextOutputSchema,
  parseContextOutput,
  type CandidateNote,
} from "./context-prompt";

// The background-gathering model call (docs/sourcework-analysis-design.md
// §5.1): OpenAI's built-in web search, resolved server-side, with a strict JSON
// answer. The searches the model made are returned so the run row can record
// them — the privacy check on "omit interviewee names" is reading that log.

const MAX_OUTPUT_TOKENS = 16384;
const MAX_WEB_SEARCHES = 10;

export type ContextCallResult =
  | { ok: true; notes: CandidateNote[]; dropped: number; queries: string[] }
  | { ok: false; error: string };

/** Every page the search tool returned or cited, so an address the model invented can be refused. */
function collectSeenUrls(response: OpenAI.Responses.Response): Set<string> {
  const urls = new Set<string>();
  for (const item of response.output) {
    if (item.type === "web_search_call") {
      const action = item.action as { sources?: { url?: string }[] } | undefined;
      for (const source of action?.sources ?? []) if (source.url) urls.add(source.url);
    }
    if (item.type === "message") {
      for (const part of item.content) {
        if (part.type !== "output_text") continue;
        for (const annotation of part.annotations ?? []) {
          if (annotation.type === "url_citation") urls.add(annotation.url);
        }
      }
    }
  }
  return urls;
}

function collectQueries(response: OpenAI.Responses.Response): string[] {
  const queries: string[] = [];
  for (const item of response.output) {
    if (item.type !== "web_search_call") continue;
    const action = item.action as { query?: string; queries?: string[] } | undefined;
    if (action?.query) queries.push(action.query);
    for (const query of action?.queries ?? []) if (!queries.includes(query)) queries.push(query);
  }
  return queries;
}

export async function callContextModel(args: {
  guide: string;
  input: string;
}): Promise<ContextCallResult> {
  const client = openAIClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };

  let response: OpenAI.Responses.Response;
  try {
    // stream() + finalResponse() rather than create(): it is the call shape the SDK's
    // types give max_tool_calls to (lib/editorial-inquiry/ai.ts does the same), and
    // a web-searching turn runs long enough that a streamed connection is the safer one.
    response = await withRateLimitRetry(() =>
      client.responses
        .stream({
          model: RESEARCH_MODEL,
          instructions: `${CONTEXT_FRAMING}\n\n${args.guide}`,
          input: args.input,
          text: {
            format: {
              type: "json_schema",
              name: "context_notes",
              strict: true,
              schema: buildContextOutputSchema(),
            },
          },
          tools: [
            {
              type: "web_search",
              // Background, not research: a slice of each result is plenty.
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
    console.error("Sourcework background call failed:", error);
    return { ok: false, error: humanizeOpenAIError(error).message };
  }

  if (response.status === "failed") {
    return { ok: false, error: response.error?.message ?? "The background step failed." };
  }
  if (response.status === "incomplete") {
    return {
      ok: false,
      error: "The background step ran out of room before it finished. Try refreshing again.",
    };
  }

  const parsed = parseContextOutput(response.output_text, { seenUrls: collectSeenUrls(response) });
  return {
    ok: true,
    notes: parsed.notes.slice(0, MAX_CONTEXT_NOTES),
    dropped: parsed.dropped,
    queries: collectQueries(response),
  };
}
