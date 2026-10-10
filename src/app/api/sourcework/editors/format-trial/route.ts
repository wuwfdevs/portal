import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkEditor } from "@/lib/sourcework/access";
import { uuidParam } from "@/lib/sourcework/route-input";
import { DIRECTION_MAX } from "@/lib/sourcework/piece-draft-prompt";
import { getFormatDraft } from "@/lib/sourcework/piece-format-queries";
import { validateFormatSpec } from "@/lib/sourcework/piece-formats";
import { runFormatTrial } from "@/lib/sourcework/piece-format-trial-run";

/**
 * "Try this draft" for a piece format (docs/sourcework-analysis-design.md §6.3, §8.1): drafts a
 * piece from one project's accepted material with the live version and with the editor's saved
 * draft, and stores both. Editors only. The draft is read from the server, not the request, so
 * what is tried is exactly what autosave holds. Nothing is written to the project.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkEditor);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    formatId?: unknown;
    projectId?: unknown;
    direction?: unknown;
  } | null;
  const formatId = uuidParam(body?.formatId);
  const projectId = uuidParam(body?.projectId);
  if (!formatId || !projectId) {
    return NextResponse.json(
      { ok: false, error: "Choose a project to try it on." },
      { status: 400 },
    );
  }
  const direction = typeof body?.direction === "string" ? body.direction.trim() : "";
  if (direction.length > DIRECTION_MAX) {
    return NextResponse.json(
      { ok: false, error: `Keep the direction under ${DIRECTION_MAX} characters.` },
      { status: 400 },
    );
  }

  const userId = guard.value.profile.id;
  const draft = await getFormatDraft(formatId, userId);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "You don't have a saved draft of this format yet. Edit it first." },
      { status: 422 },
    );
  }
  const checked = validateFormatSpec(draft);
  if (!checked.ok) {
    return NextResponse.json(
      { ok: false, error: `Fix the draft first. ${checked.error}` },
      { status: 422 },
    );
  }

  const result = await runFormatTrial({
    formatId,
    draftSpec: checked.spec,
    projectId,
    direction,
    userId,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
