import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { assertActiveProfile, ForbiddenError } from "@/lib/auth/authz";
import { buildMcpServer } from "@/lib/mcp/server";

/**
 * Phase C's MCP server entry point (docs/agent-capabilities-design.md §10):
 * the official SDK's Streamable HTTP transport over the capability
 * registry, one capability = one tool (src/lib/mcp/server.ts). Stateless —
 * no sessionIdGenerator, so a fresh transport/server pair is built per
 * request, matching how every other capability caller (a Server Action) is
 * scoped to one request.
 *
 * Auth for this phase is the in-portal case only (design doc §7/§8): the
 * same cookie-based Supabase session every page/action uses. This path
 * isn't in middleware.ts's PUBLIC_PATHS, so a request with no session at
 * all never reaches here — middleware redirects it to /login first.
 * assertActiveProfile() below covers what middleware doesn't: a signed-in
 * but disabled account, the same account-status floor requireActiveProfile
 * enforces for pages — mapped to a JSON-RPC error here instead of a
 * redirect, mirroring tracks.zip's assertToolAccess/ForbiddenError pattern.
 * Every individual capability still asserts its own tool/role access on top
 * of this — this route only gates "is there an active account at all"
 * (design doc §4: `requires` is discovery metadata, never the boundary).
 */

export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  let profile;
  try {
    profile = await assertActiveProfile();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return Response.json(
        { jsonrpc: "2.0", id: null, error: { code: -32001, message: error.message } },
        { status: 401 },
      );
    }
    throw error;
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = buildMcpServer(profile);
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
