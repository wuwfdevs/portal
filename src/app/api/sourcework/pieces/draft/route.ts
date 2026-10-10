import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { uuidParam } from "@/lib/sourcework/route-input";
import { DIRECTION_MAX } from "@/lib/sourcework/piece-draft-prompt";
import { draftPiece } from "@/lib/sourcework/piece-draft-run";

/**
 * Draft with AI (docs/sourcework-analysis-design.md §6.1, §6.3): drafts an empty piece from a
 * live format and saves it as the piece's next version. A route handler, not a Server Action,
 * because the model call can take a minute or two (same reason extraction is one).
 * Any tool member may; nothing here needs the editor role.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkContext);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    pieceId?: unknown;
    formatId?: unknown;
    themeIds?: unknown;
    direction?: unknown;
    expectVersion?: unknown;
  } | null;
  const pieceId = uuidParam(body?.pieceId);
  const formatId = uuidParam(body?.formatId);
  if (!pieceId || !formatId) {
    return NextResponse.json({ ok: false, error: "Choose a format." }, { status: 400 });
  }
  const themeIds = Array.isArray(body?.themeIds)
    ? body.themeIds.flatMap((id) => (uuidParam(id) ? [id as string] : []))
    : null;
  const direction = typeof body?.direction === "string" ? body.direction.trim() : "";
  if (direction.length > DIRECTION_MAX) {
    return NextResponse.json(
      { ok: false, error: `Keep the direction under ${DIRECTION_MAX} characters.` },
      { status: 400 },
    );
  }
  const expectVersion =
    typeof body?.expectVersion === "number" && Number.isInteger(body.expectVersion)
      ? body.expectVersion
      : undefined;

  const result = await draftPiece({
    pieceId,
    formatId,
    themeIds,
    direction,
    userId: guard.value.profile.id,
    savedVia: "generation",
    expectVersion,
  });
  // The editor refreshes its own route once this returns; nothing else here is cached.
  return NextResponse.json(result, { status: result.ok ? 200 : result.conflict ? 409 : 422 });
}
