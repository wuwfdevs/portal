import { describe, expect, it } from "vitest";
import { buildMcpAuditEvent } from "./audit";

const capability = { id: "editorial.pitch.archive", requires: { tool: "editorial-planning" } };

describe("buildMcpAuditEvent", () => {
  it("namespaces the action under mcp. and records the underlying tool", () => {
    const event = buildMcpAuditEvent({
      actorId: "user-1",
      capability,
      input: { pitchId: "pitch-1" },
      confirmed: true,
      ok: true,
    });

    expect(event).toEqual({
      actorId: "user-1",
      action: "mcp.editorial.pitch.archive",
      targetType: "mcp_tool_call",
      targetId: "editorial.pitch.archive",
      metadata: {
        tool: "editorial-planning",
        confirmed: true,
        input: { pitchId: "pitch-1" },
        result: "ok",
      },
    });
  });

  it("includes the error message on a failed invocation, and omits it on success", () => {
    const failed = buildMcpAuditEvent({
      actorId: "user-1",
      capability,
      input: {},
      confirmed: false,
      ok: false,
      errorMessage: "You do not have permission to do that.",
    });
    expect(failed.metadata).toMatchObject({
      result: "error",
      error: "You do not have permission to do that.",
    });

    const succeeded = buildMcpAuditEvent({
      actorId: "user-1",
      capability,
      input: {},
      confirmed: false,
      ok: true,
    });
    expect(succeeded.metadata).not.toHaveProperty("error");
  });
});
