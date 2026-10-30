import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "@/lib/mcp/server";
import type { Profile } from "@/lib/auth/session";

// The in-portal agent (Phase D, docs/agent-capabilities-design.md §7) is
// "just another MCP client" — it never calls capabilities/registry.invoke()
// directly. Connecting an MCP Client to a fresh in-process McpServer over a
// linked in-memory transport pair gets the same effect as talking to
// src/app/api/mcp/route.ts over HTTP (same tool set, same confirmation
// gating in registry.invoke(), same mcp.* audit event per call — see
// src/lib/mcp/server.ts) without a self-HTTP-call's cookie-forwarding
// complexity. buildMcpServer(actor) is already built fresh per caller, so
// nothing here holds a separate credential — the actor comes from this
// request's own cookie-derived Supabase session, same as everywhere else.

export interface AgentMcpConnection {
  client: Client;
  close: () => Promise<void>;
}

export async function connectAgentMcpClient(actor: Profile): Promise<AgentMcpConnection> {
  const server = buildMcpServer(actor);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "wuwf-tools-portal-agent", version: "1.0.0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
