// The site's signed listening API: one route per message in packages/portal-contracts/src/listening.ts
// (LISTENING_PATHS). All POST. The handler verifies the request signature before doing anything else; see
// lib/audience-listening/site-api.ts and docs/audience-listening-suite-design.md §4.

import { handleListeningRequest } from "@/lib/audience-listening/site-api";
import { isListeningAction } from "@/lib/audience-listening/site-api-shapes";

// Reserving an answer mints a storage address and a redo can overwrite one; never cache any of it.
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await context.params;
  if (!isListeningAction(action)) {
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return handleListeningRequest(request, action);
}
