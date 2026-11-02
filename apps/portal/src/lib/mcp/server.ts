import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { invoke, listCapabilities } from "@/lib/capabilities/registry";
import { logAuditEvent } from "@/lib/audit";
import type { Profile } from "@/lib/auth/session";
import { buildMcpAuditEvent } from "./audit";
import { splitConfirmed, toolInputSchema } from "./tool-schema";

// Phase C (docs/agent-capabilities-design.md §10): the internal MCP server,
// as thin tool handlers over registry.invoke(id, input, ctx). One capability
// = one MCP tool, named after the capability's own stable id (design doc §4:
// "MCP tool names key off it"). A fresh McpServer is built per request (see
// src/app/api/mcp/route.ts) rather than kept as a module-level singleton,
// matching how every other capability caller — a Server Action — is scoped
// to one request/one Supabase session; registry.invoke() picks up that same
// cookie-derived session itself, so nothing here holds a separate
// credential (design doc §7/§8).
//
// `capability.requires` is discovery metadata only, same as everywhere else
// this registry is used — tools/list advertises every capability regardless
// of the caller's access, and each capability's own handler is what
// actually enforces it (assertToolAccess/assertEditorialRole etc.), via the
// request-scoped client invoke() passes it. A caller with no access to a
// given tool simply gets that capability's ForbiddenError back as a normal
// tool error result.

export function buildMcpServer(actor: Profile): McpServer {
  const server = new McpServer({ name: "wuwf-tools-portal", version: "1.0.0" });

  for (const capability of listCapabilities()) {
    const description =
      capability.confirmation === "required"
        ? `${capability.summary} Requires confirmed: true — surface a confirmation prompt to the user first.`
        : capability.summary;

    server.registerTool(
      capability.id,
      { description, inputSchema: toolInputSchema(capability) },
      async (rawArgs) => {
        const { input, confirmed } = splitConfirmed((rawArgs ?? {}) as Record<string, unknown>);

        try {
          const output = await invoke(capability.id, input, { confirmed });
          await logAuditEvent(
            buildMcpAuditEvent({ actorId: actor.id, capability, input, confirmed, ok: true }),
          );
          return { content: [{ type: "text" as const, text: JSON.stringify(output ?? null) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Something went wrong.";
          await logAuditEvent(
            buildMcpAuditEvent({
              actorId: actor.id,
              capability,
              input,
              confirmed,
              ok: false,
              errorMessage: message,
            }),
          );
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }

  return server;
}
