import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkEditor } from "@/lib/sourcework/access";
import { promptSlotDefinition, validatePromptBody } from "@/lib/sourcework/prompts";
import { getPromptDraft } from "@/lib/sourcework/research-queries";
import { uuidParam } from "@/lib/sourcework/route-input";
import { runQuoteTrial } from "@/lib/sourcework/quote-trial-run";
import { runTrial } from "@/lib/sourcework/trial-run";

/**
 * "Try this draft" (docs/sourcework-analysis-design.md §8.1): runs the live
 * prompt and the editor's saved draft on one source (or, for the quote guide, one theme) and stores
 * the comparison.
 * Editors only. The draft is read from the server, not taken from the request,
 * so what is compared is exactly what autosave holds. Nothing is written to the
 * project.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkEditor);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    slot?: unknown;
    projectId?: unknown;
    sourceId?: unknown;
    themeId?: unknown;
  } | null;
  const definition = promptSlotDefinition(typeof body?.slot === "string" ? body.slot : null);
  const projectId = uuidParam(body?.projectId);
  const sourceId = uuidParam(body?.sourceId);
  if (!definition || !definition.tryable) {
    return NextResponse.json({ error: "That prompt can't be tried yet." }, { status: 400 });
  }
  const themeId = uuidParam(body?.themeId);
  const isQuoteGuide = definition.slot === "quote_quality";
  if (!projectId || (isQuoteGuide ? !themeId : !sourceId)) {
    return NextResponse.json(
      {
        error: isQuoteGuide
          ? "Choose a project and a theme to try it on."
          : "Choose a project and a source to try it on.",
      },
      { status: 400 },
    );
  }

  const draft = await getPromptDraft(definition.slot, guard.value.profile.id);
  const checked = validatePromptBody(definition.slot, draft?.body ?? "");
  if (!checked.ok) {
    return NextResponse.json({ error: `Fix the draft first. ${checked.error}` }, { status: 422 });
  }

  const userId = guard.value.profile.id;
  const result = isQuoteGuide
    ? await runQuoteTrial({ draftBody: checked.body, projectId, themeId: themeId!, userId })
    : await runTrial({
        slot: definition.slot,
        draftBody: checked.body,
        projectId,
        sourceId: sourceId!,
        userId,
      });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
