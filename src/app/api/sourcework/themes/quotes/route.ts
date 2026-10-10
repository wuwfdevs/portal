import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { suggestQuotes } from "@/lib/sourcework/quote-run";
import { uuidParam } from "@/lib/sourcework/route-input";
import { themePath, themeQuotesPath } from "@/lib/transcription/links";

/**
 * Suggest quotes for one theme (docs/sourcework-analysis-design.md §5.5): the model reads the
 * theme's supporting evidence and the transcript around it and proposes clips. One request is
 * a minute or two of a reasoning model, so it is a route handler with its own time limit rather
 * than a Server Action, like Review themes. Same cookie session and RLS as every page.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkContext);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    projectId?: unknown;
    themeId?: unknown;
  } | null;
  const projectId = uuidParam(body?.projectId);
  const themeId = uuidParam(body?.themeId);
  if (!projectId || !themeId) {
    return NextResponse.json({ error: "Choose a theme." }, { status: 400 });
  }

  const result = await suggestQuotes({ projectId, themeId, userId: guard.value.profile.id });
  if (result.ok) {
    revalidatePath(themePath(projectId, themeId));
    revalidatePath(themeQuotesPath(projectId, themeId));
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
