// Pure helpers for turning the in-portal agent's MCP tool list (Phase D,
// docs/agent-capabilities-design.md §7) into the tool definitions the
// OpenAI Responses API expects (function tools: name/description/parameters
// as a flat JSON Schema — see OpenAI's FunctionTool type). No "server-only"
// import and no SDK client types here, so this stays runnable under Vitest
// without mocking Supabase or the OpenAI SDK, per CLAUDE.md's testing
// expectations.

export interface McpToolSummary {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface AgentToolDef {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  strict: false;
}

export interface AgentToolBridge {
  /** Tool definitions to hand the model — `confirmed` stripped from every schema; see CONFIRMED_FIELD below. */
  agentTools: AgentToolDef[];
  /** Sanitized tool name (as the model sees it) -> the MCP tool name (capability id) it came from. */
  mcpNameByToolName: Map<string, string>;
  /** MCP tool names whose capability requires confirmation before it runs (design doc §5). */
  gatedToolNames: Set<string>;
}

// A capability's MCP tool schema gets an optional `confirmed` boolean added
// by src/lib/mcp/tool-schema.ts when confirmation is required. That field is
// bookkeeping for a caller that already knows a human approved — never a
// value the model should be trusted to set for itself (design doc §5, §11
// risk 2). Stripping it from what the model sees means it can't even attempt
// to set it; src/lib/agent/chat.ts's tool-call construction is the only
// place `confirmed` is ever set, and only after this route's own
// approve/decline round trip with the signed-in user.
const CONFIRMED_FIELD = "confirmed";

function sanitizeToolName(mcpName: string): string {
  // Capability ids are dotted (e.g. "editorial.pitch.archive"); OpenAI
  // function tool names only accept [a-zA-Z0-9_-]. The server recovers the
  // original via mcpNameByToolName, but the chat widget (a Client Component
  // that can't import this server-only module) reverses the same
  // substitution client-side just to display a readable label — dots become
  // "__" specifically (not a blanket "_") so that reversal is unambiguous.
  // Keep this in sync with the `.replace(/__/g, ".")` in agent-chat-widget.tsx.
  return mcpName.replace(/\./g, "__").replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildAgentToolBridge(mcpTools: McpToolSummary[]): AgentToolBridge {
  const agentTools: AgentToolDef[] = [];
  const mcpNameByToolName = new Map<string, string>();
  const gatedToolNames = new Set<string>();

  for (const tool of mcpTools) {
    const sourceProperties = tool.inputSchema.properties ?? {};
    const isGated = CONFIRMED_FIELD in sourceProperties;
    if (isGated) gatedToolNames.add(tool.name);

    const properties: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(sourceProperties)) {
      if (key === CONFIRMED_FIELD) continue;
      properties[key] = schema;
    }

    const toolName = sanitizeToolName(tool.name);
    mcpNameByToolName.set(toolName, tool.name);

    agentTools.push({
      type: "function",
      name: toolName,
      description: tool.description ?? tool.name,
      parameters: {
        type: "object",
        properties,
        required: tool.inputSchema.required?.filter((key) => key !== CONFIRMED_FIELD),
      },
      strict: false,
    });
  }

  return { agentTools, mcpNameByToolName, gatedToolNames };
}
