import { describe, expect, it } from "vitest";
import { buildAgentToolBridge, type McpToolSummary } from "./tool-bridge";

function tool(overrides: Partial<McpToolSummary> & { name: string }): McpToolSummary {
  return {
    description: "A tool",
    inputSchema: { type: "object", properties: {}, required: [] },
    ...overrides,
  };
}

describe("buildAgentToolBridge", () => {
  it("sanitizes dotted capability ids into model-safe tool names", () => {
    const bridge = buildAgentToolBridge([tool({ name: "editorial.pitch.search" })]);
    expect(bridge.agentTools).toHaveLength(1);
    const [agentTool] = bridge.agentTools;
    expect(agentTool?.name).toBe("editorial__pitch__search");
    expect(bridge.mcpNameByToolName.get("editorial__pitch__search")).toBe("editorial.pitch.search");
  });

  it("marks a tool gated when its schema carries a confirmed property, and strips it from what the model sees", () => {
    const bridge = buildAgentToolBridge([
      tool({
        name: "editorial.pitch.archive",
        inputSchema: {
          type: "object",
          properties: {
            pitchId: { type: "string" },
            confirmed: { type: "boolean" },
          },
          required: ["pitchId"],
        },
      }),
    ]);

    expect(bridge.gatedToolNames.has("editorial.pitch.archive")).toBe(true);
    const [agentTool] = bridge.agentTools;
    expect(agentTool?.parameters.properties).not.toHaveProperty("confirmed");
    expect(agentTool?.parameters.properties).toHaveProperty("pitchId");
  });

  it("does not mark a tool gated when its schema has no confirmed property", () => {
    const bridge = buildAgentToolBridge([
      tool({
        name: "sourcework.project.search",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      }),
    ]);

    expect(bridge.gatedToolNames.size).toBe(0);
  });

  it("drops confirmed from the required list if present", () => {
    const bridge = buildAgentToolBridge([
      tool({
        name: "admin.user.invite",
        inputSchema: {
          type: "object",
          properties: { email: { type: "string" }, confirmed: { type: "boolean" } },
          required: ["email", "confirmed"],
        },
      }),
    ]);

    expect(bridge.agentTools[0]?.parameters.required).toEqual(["email"]);
  });

  it("falls back to the tool name when no description is provided", () => {
    const bridge = buildAgentToolBridge([
      tool({ name: "audience-listening.query.list", description: undefined }),
    ]);
    expect(bridge.agentTools[0]?.description).toBe("audience-listening.query.list");
  });
});
