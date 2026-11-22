// The site's signed listening AUTHORING API: one route per message in packages/portal-contracts/src/listening-authoring.ts
// (LISTENING_AUTHORING_PATHS). All POST. The first feature of the STAFF ACTIONS channel (lib/staff-actions/receive.ts), not the listener channel (../../listening).
// See lib/audience-listening/authoring-api.ts.

import { LISTENING_AUTHORING_ACTIONS, type ListeningAuthoringAction } from "@wuwf/portal-contracts";
import { handleAuthoringRequest } from "@/lib/audience-listening/authoring-api";

export const dynamic = "force-dynamic";

function isAction(value: string): value is ListeningAuthoringAction {
  return (LISTENING_AUTHORING_ACTIONS as readonly string[]).includes(value);
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await context.params;
  if (!isAction(action)) {
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  return handleAuthoringRequest(request, action);
}
