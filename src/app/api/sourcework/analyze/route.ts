import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { runAnalyze } from "@/lib/sourcework/analyze-run";
import { encodeStreamEvent } from "@/lib/sourcework/extract-stream";
import { uuidParam } from "@/lib/sourcework/route-input";

/**
 * Analyzes one source and streams its progress as it goes
 * (lib/sourcework/extract-stream.ts). A route handler rather than a Server
 * Action because the Sources tab runs several of these at once, and Next.js runs
 * one page's Server Actions strictly one after another. Same cookie session and
 * RLS as every page.
 */

export const runtime = "nodejs";
// One request is a whole source read by a reasoning model, window by window.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute(assertSourceworkContext);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    projectId?: unknown;
    sourceId?: unknown;
  } | null;
  const projectId = uuidParam(body?.projectId);
  const sourceId = uuidParam(body?.sourceId);
  if (!projectId || !sourceId) {
    return NextResponse.json(
      { error: "Choose a source in a project to analyze." },
      { status: 400 },
    );
  }

  const userId = guard.value.profile.id;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Parameters<typeof encodeStreamEvent>[0]) =>
        controller.enqueue(encoder.encode(encodeStreamEvent(event)));
      try {
        const result = await runAnalyze({
          projectId,
          sourceId,
          userId,
          onProgress: (done, total) => send({ type: "progress", done, total }),
        });
        send(
          result.ok
            ? {
                type: "result",
                ok: true,
                added: result.findings,
                skippedReviewed: result.skippedDecided,
                dropped: result.dropped,
                clips: result.clips,
                consulted: result.consulted,
              }
            : { type: "result", ok: false, error: result.error },
        );
      } catch (error) {
        console.error("Sourcework analyze route failed:", error);
        send({ type: "result", ok: false, error: "Analysis failed. Try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
