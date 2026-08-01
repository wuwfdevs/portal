import "server-only";
import OpenAI from "openai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectAgentMcpClient } from "./mcp-client";
import { buildAgentToolBridge, type AgentToolBridge } from "./tool-bridge";
import type { Profile } from "@/lib/auth/session";

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
// server-side state (`previous_response_id`/`store`) — `store: false` below
// keeps OpenAI from retaining a second copy of the transcript we don't
// control.

const MODEL = "gpt-5.4-mini";
const MAX_OUTPUT_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 6;

const INSTRUCTIONS = `You are the WUWF Tools Portal assistant, embedded in the portal as a chat panel.
You help staff work across Editorial Planning, Sourcework, Remote Interview, and Audience Listening using the tools available to you.

- Only call a tool when it's needed to answer the current request.
- Each person's tool access is enforced independently of this conversation. If a tool call fails with a permission error, tell the user plainly rather than retrying it.
- Some tools require the user to confirm a pending action before they run — when that happens, wait for the outcome; don't repeat the call.
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

export interface AgentTurnInput {
  history: OpenAI.Responses.ResponseInputItem[];
  input?: string;
  confirmation?: { toolUseId: string; approved: boolean };
}

export interface AgentTurnResult {
  history: OpenAI.Responses.ResponseInputItem[];
  reply: string | null;
  pendingConfirmation: PendingConfirmation | null;
}

export async function runAgentTurn(actor: Profile, turn: AgentTurnInput): Promise<AgentTurnResult> {
  const openai = getOpenAIClient();
  const { client: mcp, close } = await connectAgentMcpClient(actor);

  try {
    const { tools } = await mcp.listTools();
    const bridge = buildAgentToolBridge(tools);

    let history: OpenAI.Responses.ResponseInputItem[];
    if (turn.confirmation) {
      history = await resolveConfirmation(mcp, bridge, turn.history, turn.confirmation);
    } else if (turn.input) {
      history = [...turn.history, { role: "user", content: turn.input }];
    } else {
      throw new Error("Provide either input or confirmation.");
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await openai.responses.create({
        model: MODEL,
        instructions: INSTRUCTIONS,
        input: history,
        tools: bridge.agentTools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        reasoning: { effort: "low" },
        store: false,
      });

      if (response.status === "failed") {
        throw new Error(response.error?.message ?? "The assistant failed to respond.");
      }

      // response.output items (ResponseOutputItem) are the same items the API
      // expects back as input on the next turn — the standard "manual state"
      // pattern for the Responses API — but a couple of output-only variants
      // (e.g. computer-call results) carry a slightly wider status union than
      // the input side accepts, which the type system can't reconcile across
      // the whole union. Runtime shape is correct; only the type needs help.
      history = [
        ...history,
        ...(response.output as unknown as OpenAI.Responses.ResponseInputItem[]),
      ];

      const functionCall = response.output.find(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
      );

      if (!functionCall) {
        const reply = response.output_text || extractRefusal(response.output) || null;
        return { history, reply, pendingConfirmation: null };
      }

      const mcpName = bridge.mcpNameByToolName.get(functionCall.name);
      const input = parseArguments(functionCall.arguments);

      if (!mcpName) {
        history = appendFunctionCallOutput(history, functionCall.call_id, "Unknown tool.");
        continue;
      }

      if (bridge.gatedToolNames.has(mcpName)) {
        return {
          history,
          reply: null,
          pendingConfirmation: {
            toolUseId: functionCall.call_id,
            capabilityId: mcpName,
            description:
              bridge.agentTools.find((t) => t.name === functionCall.name)?.description ?? mcpName,
            input,
          },
        };
      }

      const result = await callMcpTool(mcp, mcpName, input);
      history = appendFunctionCallOutput(history, functionCall.call_id, result.text);
    }

    return {
      history,
      reply: "I've made several tool calls without finishing — ask again to continue.",
      pendingConfirmation: null,
    };
  } finally {
    await close();
  }
}

async function resolveConfirmation(
  mcp: Client,
  bridge: AgentToolBridge,
  history: OpenAI.Responses.ResponseInputItem[],
  confirmation: { toolUseId: string; approved: boolean },
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
  return appendFunctionCallOutput(history, functionCall.call_id, result.text);
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
