import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { uuidParam } from "@/lib/sourcework/route-input";
import { DIRECTION_MAX } from "@/lib/sourcework/piece-draft-prompt";
import { outlinePiece } from "@/lib/sourcework/piece-outline-run";

/**
 * Outline a piece (docs/sourcework-analysis-design.md §22): beats and actualities from the project's
 * accepted findings and excerpts, saved as the piece's next version. A route handler, not a Server
 * Action, because a run that checks the transcripts can take minutes. Any tool member may.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkContext);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    pieceId?: unknown;
    formatId?: unknown;
    direction?: unknown;
    expectVersion?: unknown;
  } | null;
  const pieceId = uuidParam(body?.pieceId);
  if (!pieceId) {
    return NextResponse.json({ ok: false, error: "Choose a piece to outline." }, { status: 400 });
  }
  // A format is optional for an outline; a malformed one is a mistake worth refusing, not ignoring.
  const formatId = body?.formatId ? uuidParam(body.formatId) : null;
  if (body?.formatId && !formatId) {
    return NextResponse.json(
      { ok: false, error: "Choose a format from the list." },
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
  if (typeof body?.expectVersion !== "number" || !Number.isInteger(body.expectVersion)) {
    return NextResponse.json(
      { ok: false, error: "Reload the piece and try again." },
      { status: 400 },
    );
  }

  const result = await outlinePiece({
    pieceId,
    formatId,
    direction,
    userId: guard.value.profile.id,
    expectVersion: body.expectVersion,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.conflict ? 409 : 422 });
}
