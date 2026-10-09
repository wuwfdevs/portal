import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { gatherContext } from "@/lib/sourcework/context-run";
import { uuidParam } from "@/lib/sourcework/route-input";

/**
 * Gathers a project's web background (docs/sourcework-analysis-design.md §5.1).
 * `force` is the Refresh button; without it, the run is skipped when the last
 * good one already covers the current questions. A route handler so a minute of
 * web searching never holds up the Setup tab's other Server Actions.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkContext);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    projectId?: unknown;
    force?: unknown;
  } | null;
  const projectId = uuidParam(body?.projectId);
  if (!projectId) return NextResponse.json({ error: "Choose a project." }, { status: 400 });

  const result = await gatherContext({
    projectId,
    userId: guard.value.profile.id,
    force: body?.force === true,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
