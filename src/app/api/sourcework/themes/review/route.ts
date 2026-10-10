import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { reviewThemes } from "@/lib/sourcework/theme-run";
import { uuidParam } from "@/lib/sourcework/route-input";
import { projectPath } from "@/lib/transcription/links";

/**
 * Review themes (docs/sourcework-analysis-design.md §5.4): files the pool into
 * the accepted themes, then asks the model for new themes and merges from what
 * is left. One request is a minute or two of a reasoning model, so it is a route
 * handler with its own time limit rather than a Server Action holding up the
 * Themes tab's others. Same cookie session and RLS as every page.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkContext);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
  const projectId = uuidParam(body?.projectId);
  if (!projectId) return NextResponse.json({ error: "Choose a project." }, { status: 400 });

  const result = await reviewThemes({ projectId, userId: guard.value.profile.id });
  if (result.ok) revalidatePath(projectPath(projectId, "themes"));
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
