// Pure — no "server-only" import here (unlike the rest of src/lib/mcp/), so
// buildMcpAuditEvent stays testable under Vitest without mocking Supabase,
// per CLAUDE.md's testing expectations. Only types are pulled from
// lib/capabilities/registry and lib/audit; `import type` is erased at build
// time, so it doesn't pull "server-only" in at runtime the way a value
// import would.

import type { AnyCapability } from "@/lib/capabilities/registry";
import type { logAuditEvent } from "@/lib/audit";

export interface McpInvocationOutcome {
  actorId: string;
  capability: Pick<AnyCapability, "id" | "requires">;
  input: Record<string, unknown>;
  confirmed: boolean;
  ok: boolean;
  errorMessage?: string;
}

/**
 * The audit_events row for one MCP tool invocation (design doc §10 Phase C,
 * §11 risk 3). Every invocation gets exactly one of these — independent of
 * whatever audit event the capability's own handler may additionally log —
 * under the `mcp.` action namespace, so an agent-originated write is
 * distinguishable from a UI-originated one even for capabilities (reads,
 * mainly) that never call logAuditEvent themselves.
 */
export function buildMcpAuditEvent(
  outcome: McpInvocationOutcome,
): Parameters<typeof logAuditEvent>[0] {
  return {
    actorId: outcome.actorId,
    action: `mcp.${outcome.capability.id}`,
    targetType: "mcp_tool_call",
    targetId: outcome.capability.id,
    metadata: {
      tool: outcome.capability.requires.tool,
      confirmed: outcome.confirmed,
      input: outcome.input,
      result: outcome.ok ? "ok" : "error",
      ...(outcome.errorMessage ? { error: outcome.errorMessage } : {}),
    },
  };
}
