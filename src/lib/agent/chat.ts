import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectAgentMcpClient } from "./mcp-client";
import { buildAgentToolBridge, type AgentToolBridge } from "./tool-bridge";
import type { Profile } from "@/lib/auth/session";

// The in-portal agent's turn loop (Phase D, docs/agent-capabilities-design.md
// §7). One HTTP request handles one "round": it runs non-gated tool calls
// itself (up to MAX_TOOL_ROUNDS), and pauses — returning to the caller
// instead of executing — the moment the model wants to call a capability
// that requires confirmation (design doc §5). The chat widget shows that
// pending call to the signed-in user and only resumes the loop with
// `confirmed: true` after an explicit approve click; a decline resumes with
// a synthetic "user declined" tool result instead of calling the capability
// at all. See tool-bridge.ts's CONFIRMED_FIELD comment for why the model's
// own `confirmed` input (if any) is never trusted.
//
// There is still no job queue in this repo (per CLAUDE.md) — this loop is
// synchronous within the request, same as every Server Action.

const MODEL = "claude-opus-5";
const MAX_TOKENS = 8000;
const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `You are the WUWF Tools Portal assistant, embedded in the portal as a chat panel.
You help staff work across Editorial Planning, Sourcework, Remote Interview, and Audience Listening using the tools available to you.

- Only call a tool when it's needed to answer the current request.
- Each person's tool access is enforced independently of this conversation. If a tool call fails with a permission error, tell the user plainly rather than retrying it.
- Some tools require the user to confirm a pending action before they run — when that happens, wait for the outcome; don't repeat the call.
- Keep responses concise and specific to what was asked.`;

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("The assistant isn't configured yet — ANTHROPIC_API_KEY is not set.");
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

export interface PendingConfirmation {
  toolUseId: string;
  capabilityId: string;
  description: string;
  input: Record<string, unknown>;
}

export interface AgentTurnInput {
  history: Anthropic.MessageParam[];
  input?: string;
  confirmation?: { toolUseId: string; approved: boolean };
}

export interface AgentTurnResult {
  history: Anthropic.MessageParam[];
  reply: string | null;
  pendingConfirmation: PendingConfirmation | null;
}

export async function runAgentTurn(actor: Profile, turn: AgentTurnInput): Promise<AgentTurnResult> {
  const anthropic = getAnthropicClient();
  const { client: mcp, close } = await connectAgentMcpClient(actor);

  try {
    const { tools } = await mcp.listTools();
    const bridge = buildAgentToolBridge(tools);

    let history: Anthropic.MessageParam[];
    if (turn.confirmation) {
      history = await resolveConfirmation(mcp, bridge, turn.history, turn.confirmation);
    } else if (turn.input) {
      history = [...turn.history, { role: "user", content: turn.input }];
    } else {
      throw new Error("Provide either input or confirmation.");
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: bridge.anthropicTools,
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
        messages: history,
      });

      history = [...history, { role: "assistant", content: response.content }];

      if (response.stop_reason === "refusal") {
        return { history, reply: "I can't help with that request.", pendingConfirmation: null };
      }

      if (response.stop_reason !== "tool_use") {
        return { history, reply: extractText(response.content), pendingConfirmation: null };
      }

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      if (!toolUse) {
        return { history, reply: extractText(response.content), pendingConfirmation: null };
      }

      const mcpName = bridge.mcpNameByAnthropicName.get(toolUse.name);
      if (!mcpName) {
        history = appendToolResult(history, toolUse.id, "Unknown tool.", true);
        continue;
      }

      if (bridge.gatedToolNames.has(mcpName)) {
        return {
          history,
          reply: null,
          pendingConfirmation: {
            toolUseId: toolUse.id,
            capabilityId: mcpName,
            description: bridge.anthropicTools.find((t) => t.name === toolUse.name)?.description ?? mcpName,
            input: (toolUse.input ?? {}) as Record<string, unknown>,
          },
        };
      }

      const result = await callMcpTool(mcp, mcpName, toolUse.input);
      history = appendToolResult(history, toolUse.id, result.text, result.isError);
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
  history: Anthropic.MessageParam[],
  confirmation: { toolUseId: string; approved: boolean },
): Promise<Anthropic.MessageParam[]> {
  const toolUse = findToolUseBlock(history[history.length - 1], confirmation.toolUseId);
  if (!toolUse) {
    throw new Error("No pending tool call matches this confirmation.");
  }

  const mcpName = bridge.mcpNameByAnthropicName.get(toolUse.name);
  if (!mcpName) {
    return appendToolResult(history, toolUse.id, "Unknown tool.", true);
  }

  if (!confirmation.approved) {
    return appendToolResult(
      history,
      toolUse.id,
      "The user declined to approve this action. Do not attempt it again unless asked.",
      false,
    );
  }

  const input = { ...((toolUse.input ?? {}) as Record<string, unknown>) };
  delete input.confirmed;
  const result = await callMcpTool(mcp, mcpName, { ...input, confirmed: true });
  return appendToolResult(history, toolUse.id, result.text, result.isError);
}

function findToolUseBlock(
  message: Anthropic.MessageParam | undefined,
  toolUseId: string,
): Anthropic.ToolUseBlock | undefined {
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return undefined;
  return message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.id === toolUseId,
  );
}

async function callMcpTool(
  mcp: Client,
  name: string,
  args: unknown,
): Promise<{ text: string; isError: boolean }> {
  const result = await mcp.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> });
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((block) => (block && typeof block === "object" && block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();
  return { text: text || "(no output)", isError: Boolean(result.isError) };
}

function appendToolResult(
  history: Anthropic.MessageParam[],
  toolUseId: string,
  text: string,
  isError: boolean,
): Anthropic.MessageParam[] {
  return [
    ...history,
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: text,
          is_error: isError || undefined,
        },
      ],
    },
  ];
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
