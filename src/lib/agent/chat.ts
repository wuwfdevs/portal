import "server-only";
import OpenAI from "openai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { humanizeOpenAIError } from "@/lib/openai-error";
import { connectAgentMcpClient } from "./mcp-client";
import { buildAgentToolBridge, type AgentToolBridge } from "./tool-bridge";
import type { Profile } from "@/lib/auth/session";
import { getCapability } from "@/lib/capabilities/registry";
import { pieceAssistantInstructions } from "@/lib/sourcework/piece-assistant-prompt";
import { PIECE_ASSISTANT_BUILT_IN } from "@/lib/sourcework/prompts";
import { getLivePrompt } from "@/lib/sourcework/research-queries";

// The in-portal agent's turn loop (Phase D, docs/agent-capabilities-design.md
// §7), driven by OpenAI's Responses API (reusing OPENAI_API_KEY — see
// .env.example — the same key already configured for Sourcework's
// embeddings). One HTTP request handles one "round": it runs non-gated tool
// calls itself (up to MAX_TOOL_ROUNDS), and pauses — returning to the caller
// instead of executing — the moment the model wants to call a capability
// that requires confirmation (design doc §5). The chat widget shows that
// pending call to the signed-in user and only resumes the loop with
// `confirmed: true` after an explicit approve click; a decline resumes with
// a synthetic "user declined" tool result instead of calling the capability
// at all. See tool-bridge.ts's CONFIRMED_FIELD comment for why the model's
// own `confirmed` input (if any) is never trusted.
//
// There is still no job queue in this repo (per CLAUDE.md) — this loop is
// synchronous within the request, same as every Server Action. The full
// conversation (an OpenAI.Responses.ResponseInputItem[]) round-trips through
// the client on every call rather than relying on the Responses API's own
// server-side state (`previous_response_id`) — `store: true` below is for
// dashboard observability only (an explicit request, 2026-08-20, same as
// Editorial Inquiry's ai.ts: the OpenAI Logs page only lists stored
// responses), never a state mechanism this loop reads back.
//
// streamAgentTurn is an async generator, not a single Promise: each round
// calls openai.responses.stream() (the SDK's ResponseStream helper — an
// async-iterable of ResponseStreamEvents plus a finalResponse() that
// resolves to the same Response shape create() used to return) so text
// tokens reach src/app/api/agent/chat/route.ts, and the browser, as the
// model produces them instead of only after the whole turn — including any
// tool-call rounds — finishes. Only "delta" events (model-authored reply
// text) are surfaced this way; a function_call's name/arguments are never
// yielded, so the widget has nothing tool-shaped to accidentally render (see
// agent-chat-widget.tsx's ChatEntry, which now only renders plain message
// items). The final authoritative `history` — including the function_call/
// function_call_output items the next turn needs — still only appears once,
// on the terminal "pendingConfirmation" or "done" event.

const MODEL = "gpt-5.4-mini";
const MAX_OUTPUT_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 6;

const INSTRUCTIONS = `You are the WUWF Tools Portal assistant, embedded in the portal as a chat panel.
You help staff work across Editorial Planning, Sourcework, Remote Interview, and Audience Listening using the tools available to you.

- Only call a tool when it's needed to answer the current request.
- Each person's tool access is enforced independently of this conversation. If a tool call fails with a permission error, tell the user plainly rather than retrying it.
- Some tools require the user to confirm a pending action before they run — when that happens, wait for the outcome; don't repeat the call.
- Before submitting a field with a fixed set of options (e.g. a pitch's pillar, format, or urgency), look up the real allowed values with a schema/lookup tool rather than guessing at plausible-sounding ones.
- When a tool result includes a "url" field, share it as a markdown link, e.g. [Pitch title](url), so the person can open what you found or created — never report a bare id on its own.
- For "how do I…" questions about a portal tool or a station procedure, search Resources first (resources.search) and answer from the articles it returns, linking each one you rely on as [title](url). If nothing relevant comes back, say so plainly instead of guessing how the tool works.
- Keep responses concise and specific to what was asked.`;

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("The assistant isn't configured yet — OPENAI_API_KEY is not set.");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

export interface PendingConfirmation {
  toolUseId: string;
  capabilityId: string;
  description: string;
  input: Record<string, unknown>;
}

/**
 * What the person has open, so "tighten the setup" has an object
 * (docs/sourcework-analysis-design.md §6.4). The route resolves it through the
 * caller's own session, so it is never more than the page already showed them.
 */
export type AgentPageContext = {
  kind: "piece";
  pieceId: string;
  projectId: string;
  title: string;
};

export interface AgentTurnInput {
  history: OpenAI.Responses.ResponseInputItem[];
  input?: string;
  confirmation?: { toolUseId: string; approved: boolean };
  pageContext?: AgentPageContext | null;
}

/**
 * The instructions for one turn: the standing ones, plus what the person has open. `pieceGuide`
 * is the editors' "piece_assistant" wording (lib/sourcework/prompts.ts), read live by the caller.
 */
export function instructionsFor(
  pageContext: AgentPageContext | null | undefined,
  pieceGuide: string = PIECE_ASSISTANT_BUILT_IN,
): string {
  if (!pageContext) return INSTRUCTIONS;
  return `${INSTRUCTIONS}

${pieceAssistantInstructions(pageContext, pieceGuide)}`;
}

export type AgentStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "pendingConfirmation";
      history: OpenAI.Responses.ResponseInputItem[];
      pendingConfirmation: PendingConfirmation;
      toolsUsed: string[];
      wrote: boolean;
    }
  | {
      type: "done";
      history: OpenAI.Responses.ResponseInputItem[];
      /** Short labels of the tools this turn called, in order ("read piece", "replace narration"). */
      toolsUsed: string[];
      /** A tool that changes what a page shows ran: the widget refreshes the page. */
      wrote: boolean;
    }
  | { type: "error"; message: string };

export async function* streamAgentTurn(
  actor: Profile,
  turn: AgentTurnInput,
): AsyncGenerator<AgentStreamEvent> {
  const openai = getOpenAIClient();
  // The editors' wording for working in a piece. Failing to read it must not fail the chat.
  let pieceGuide = PIECE_ASSISTANT_BUILT_IN;
  if (turn.pageContext) {
    try {
      pieceGuide = (await getLivePrompt("piece_assistant")).body;
    } catch (error) {
      console.error("Could not read the piece assistant prompt; using the built-in text:", error);
    }
  }
  const { client: mcp, close } = await connectAgentMcpClient(actor);

  try {
    const { tools } = await mcp.listTools();
    const bridge = buildAgentToolBridge(tools);

    const toolsUsed: string[] = [];
    let wrote = false;
    const record = (mcpName: string) => {
      const capability = getCapability(mcpName);
      toolsUsed.push(capability?.label ?? mcpName);
      if (capability?.writes) wrote = true;
    };

    let history: OpenAI.Responses.ResponseInputItem[];
    if (turn.confirmation) {
      history = await resolveConfirmation(mcp, bridge, turn.history, turn.confirmation, record);
    } else if (turn.input) {
      history = [...turn.history, { role: "user", content: turn.input }];
    } else {
      yield { type: "error", message: "Provide either input or confirmation." };
      return;
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let response;
      try {
        const stream = openai.responses.stream({
          model: MODEL,
          instructions: instructionsFor(turn.pageContext, pieceGuide),
          input: history,
          tools: bridge.agentTools,
          tool_choice: "auto",
          parallel_tool_calls: false,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          reasoning: { effort: "low" },
          store: true,
        });

        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            yield { type: "delta", text: event.delta };
          }
        }

        response = await stream.finalResponse();
      } catch (error) {
        // A raw SDK failure (most notably a rate limit against the org's
        // shared token cap) reached the widget verbatim — org id, token
        // counts, billing URL and all. Log the raw error (its response
        // headers carry the org/project diagnostics), surface the humanized
        // one. See lib/openai-error.ts.
        console.error("Agent chat OpenAI call failed:", error);
        throw humanizeOpenAIError(error);
      }

      if (response.status === "failed") {
        yield {
          type: "error",
          message: response.error?.message ?? "The assistant failed to respond.",
        };
        return;
      }

      // response.output's static type is ResponseStream's ParsedResponseOutputItem<null>[]
      // (it supports .parse()-based structured outputs, which this loop never
      // uses) rather than the plain ResponseOutputItem[] the non-streaming
      // create() call returned — a couple of output-only variants (e.g.
      // computer-call results, file-search calls) carry a wider/narrower
      // shape than the input side or this loop's own narrowing expects,
      // which the type system can't reconcile across the whole union.
      // Runtime shape is unaffected; only the type needs help.
      const output = response.output as unknown as OpenAI.Responses.ResponseOutputItem[];

      history = [...history, ...stripParsedFields(output)];

      const functionCall = output.find(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
      );

      if (!functionCall) {
        // output_text was already streamed as "delta" events above; a
        // refusal isn't output_text, so it never streamed and needs
        // surfacing here instead.
        if (!response.output_text) {
          const refusal = extractRefusal(output);
          if (refusal) yield { type: "delta", text: refusal };
        }
        yield { type: "done", history, toolsUsed, wrote };
        return;
      }

      const mcpName = bridge.mcpNameByToolName.get(functionCall.name);
      const input = parseArguments(functionCall.arguments);

      if (!mcpName) {
        history = appendFunctionCallOutput(history, functionCall.call_id, "Unknown tool.");
        continue;
      }

      if (bridge.gatedToolNames.has(mcpName)) {
        yield {
          type: "pendingConfirmation",
          history,
          pendingConfirmation: {
            toolUseId: functionCall.call_id,
            capabilityId: mcpName,
            description:
              bridge.agentTools.find((t) => t.name === functionCall.name)?.description ?? mcpName,
            input,
          },
          toolsUsed,
          wrote,
        };
        return;
      }

      const result = await callMcpTool(mcp, mcpName, input);
      record(mcpName);
      history = appendFunctionCallOutput(history, functionCall.call_id, result.text);
    }

    yield {
      type: "delta",
      text: "I've made several tool calls without finishing — ask again to continue.",
    };
    yield { type: "done", history, toolsUsed, wrote };
  } finally {
    await close();
  }
}

async function resolveConfirmation(
  mcp: Client,
  bridge: AgentToolBridge,
  history: OpenAI.Responses.ResponseInputItem[],
  confirmation: { toolUseId: string; approved: boolean },
  record: (mcpName: string) => void,
): Promise<OpenAI.Responses.ResponseInputItem[]> {
  const functionCall = findFunctionCall(history, confirmation.toolUseId);
  if (!functionCall) {
    throw new Error("No pending tool call matches this confirmation.");
  }

  const mcpName = bridge.mcpNameByToolName.get(functionCall.name);
  if (!mcpName) {
    return appendFunctionCallOutput(history, functionCall.call_id, "Unknown tool.");
  }

  if (!confirmation.approved) {
    return appendFunctionCallOutput(
      history,
      functionCall.call_id,
      "The user declined to approve this action. Do not attempt it again unless asked.",
    );
  }

  const input = parseArguments(functionCall.arguments);
  delete input.confirmed;
  const result = await callMcpTool(mcp, mcpName, { ...input, confirmed: true });
  record(mcpName);
  return appendFunctionCallOutput(history, functionCall.call_id, result.text);
}

// ResponseStream's finalResponse() decorates output items with SDK-only
// fields (`parsed_arguments` on a function_call, `parsed` on output_text
// content). They are not part of the API's input schema, so replaying the
// output as history failed the next round with "400 Unknown parameter:
// 'input[2].parsed_arguments'".
function stripParsedFields(
  output: OpenAI.Responses.ResponseOutputItem[],
): OpenAI.Responses.ResponseInputItem[] {
  return output.map((item) => {
    const { parsed_arguments: _parsedArguments, ...rest } = item as typeof item & {
      parsed_arguments?: unknown;
    };
    if (rest.type === "message" && Array.isArray(rest.content)) {
      rest.content = rest.content.map((part) => {
        const { parsed: _parsed, ...partRest } = part as typeof part & { parsed?: unknown };
        return partRest as typeof part;
      });
    }
    return rest as unknown as OpenAI.Responses.ResponseInputItem;
  });
}

function findFunctionCall(
  history: OpenAI.Responses.ResponseInputItem[],
  callId: string,
): OpenAI.Responses.ResponseFunctionToolCall | undefined {
  return history.find(
    (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
      item.type === "function_call" && item.call_id === callId,
  );
}

async function callMcpTool(
  mcp: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string }> {
  const result = await mcp.callTool({ name, arguments: args });
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((block) => (block && typeof block === "object" && block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();
  return { text: text || "(no output)" };
}

function appendFunctionCallOutput(
  history: OpenAI.Responses.ResponseInputItem[],
  callId: string,
  output: string,
): OpenAI.Responses.ResponseInputItem[] {
  return [...history, { type: "function_call_output", call_id: callId, output }];
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function extractRefusal(output: OpenAI.Responses.ResponseOutputItem[]): string | null {
  for (const item of output) {
    if (item.type !== "message") continue;
    const refusal = item.content.find(
      (block): block is OpenAI.Responses.ResponseOutputRefusal => block.type === "refusal",
    );
    if (refusal) return refusal.refusal;
  }
  return null;
}
