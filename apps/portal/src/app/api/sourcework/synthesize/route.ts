import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { runSynthesis } from "@/lib/sourcework/synthesis-run";
import { uuidParam } from "@/lib/sourcework/route-input";

/**
 * Synthesizes a project's accepted findings into what they establish for each research question
 * (docs/sourcework-analysis-design.md §21). A route handler rather than a Server Action because one
 * run can take minutes while the model checks the transcripts, and it returns plain JSON for the
 * screen to show its progress over. Same cookie session and RLS as every page.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkContext);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
  const projectId = uuidParam(body?.projectId);
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Choose a project to synthesize." },
      { status: 400 },
    );
  }

  try {
    const result = await runSynthesis({ projectId, userId: guard.value.profile.id });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Sourcework synthesis route failed:", error);
    return NextResponse.json({ ok: false, error: "Synthesis failed. Try again." });
  }
}
