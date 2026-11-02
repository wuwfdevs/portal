import "server-only";
import type OpenAI from "openai";
import { humanizeOpenAIError } from "@/lib/openai-error";
import { RESEARCH_MODEL } from "./model";
import { NOT_CONFIGURED, openAIClient, withRateLimitRetry } from "./openai-call";

// One structured-output call in which the model may use tools first (docs/sourcework-analysis-design.md
// §21). The model looks things up through functions this code runs for it, and the loop ends when it
// answers in the strict schema. This is "agentic inside a step, structured at its boundary": the
// answer is still validated and written by the caller, so a tool-using run is no less checkable than
// a single-shot one.
//
// Like the in-portal agent (lib/agent/chat.ts), the loop carries the whole conversation itself and
// resends the instructions each round rather than leaning on the API's stored state; `store: true`
// is for the OpenAI dashboard only. Round limits are in code: after `maxRounds` the model is told
// to answer with what it has (`tool_choice: "none"`), never left to loop.

export interface LoopTool {
  name: string;
  description: string;
  /** A strict JSON schema: every property required, no extras. Optional values are nullable. */
  parameters: Record<string, unknown>;
  run: (args: unknown) => Promise<unknown>;
}

export type ToolLoopResult =
  | { ok: true; text: string; rounds: number; calls: { name: string; failed: boolean }[] }
  | { ok: false; error: string };

type Client = Pick<OpenAI, "responses">;

const DEFAULT_MAX_ROUNDS = 6;
const DEFAULT_MAX_OUTPUT_TOKENS = 32768;
/** A tool's answer is trimmed to this before the model reads it, so one verbose result cannot fill the context. */
const MAX_TOOL_OUTPUT_CHARS = 16_000;

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toolOutput(value: unknown): string {
  const text = JSON.stringify(value) ?? "null";
  return text.length > MAX_TOOL_OUTPUT_CHARS
    ? `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}…(trimmed)`
    : text;
}

export async function runToolLoop(args: {
  step: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  tools: readonly LoopTool[];
  maxRounds?: number;
  effort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
  client?: Client | null;
}): Promise<ToolLoopResult> {
  const client = args.client ?? openAIClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };

  const maxRounds = args.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const toolByName = new Map(args.tools.map((tool) => [tool.name, tool]));
  const toolDefinitions = args.tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true,
  }));

  let history: OpenAI.Responses.ResponseInputItem[] = [{ role: "user", content: args.input }];
  const calls: { name: string; failed: boolean }[] = [];

  for (let round = 0; round <= maxRounds; round++) {
    // The last round is not a chance to look something else up: it is the answer.
    const mustAnswer = round === maxRounds;
    let response: OpenAI.Responses.Response;
    try {
      response = await withRateLimitRetry(() =>
        client.responses.create({
          model: RESEARCH_MODEL,
          instructions: args.instructions,
          input: history,
          ...(toolDefinitions.length > 0
            ? {
                tools: toolDefinitions,
                tool_choice: mustAnswer ? ("none" as const) : ("auto" as const),
                parallel_tool_calls: false,
              }
            : {}),
          text: {
            format: {
              type: "json_schema",
              name: args.schemaName,
              strict: true,
              schema: args.schema,
            },
          },
          reasoning: { effort: args.effort ?? "medium" },
          max_output_tokens: args.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
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

    const functionCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
    );
    if (functionCalls.length === 0) {
      return { ok: true, text: response.output_text, rounds: round + 1, calls };
    }
    if (mustAnswer) {
      return {
        ok: false,
        error: `The ${args.step} step kept asking for more before answering. Try again.`,
      };
    }

    history = [...history, ...(response.output as unknown as OpenAI.Responses.ResponseInputItem[])];
    for (const call of functionCalls) {
      const tool = toolByName.get(call.name);
      let output: unknown;
      let failed = false;
      if (!tool) {
        output = { error: `There is no tool called ${call.name}.` };
        failed = true;
      } else {
        try {
          output = await tool.run(parseArguments(call.arguments));
        } catch (error) {
          // The model reads this and can try something else; the run does not fail over a lookup.
          output = { error: error instanceof Error ? error.message : "That lookup failed." };
          failed = true;
        }
      }
      calls.push({ name: call.name, failed });
      history.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: toolOutput(output),
      });
    }
  }
  return { ok: false, error: `The ${args.step} step did not finish. Try again.` };
}
