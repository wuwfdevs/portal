import { NextResponse } from "next/server";
import { z } from "zod";
import { assertToolAccess, ForbiddenError } from "@/lib/auth/authz";
import {
  streamEditorialTurnEvents,
  type EditorialTurnStreamEvent,
} from "@/lib/editorial-inquiry/turn";
import { DRILLDOWN_DIRECTIVE, EVALUATE_DIRECTIVE } from "@/lib/editorial-inquiry/directives";

/**
 * Editorial Inquiry's turn endpoint — the streaming counterpart to what were
 * four Server Actions (branch/drilldown/evaluate/discuss). A Server Action
 * can't stream, and an editorial turn (web search + medium-effort reasoning)
 * routinely runs long enough that a silent wait read as a hang — this is the
 * same SSE shape as /api/agent/chat: a text/event-stream of JSON-encoded
 * events, `delta` for reply tokens, then one terminal `done` (carrying the
 * persisted turn outcome) or `error`. Auth is the same cookie-based Supabase
 * session every page/action uses; streamEditorialTurnEvents itself calls
 * assertToolAccess before touching anything.
 *
 * The canned directives for the two button modes are resolved HERE, not
 * accepted from the client — the client names a mode, never the directive
 * text, so the stored user message always matches directives.ts exactly
 * (the inspector recognizes directive messages by exact body match).
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  questionId: z.string().uuid(),
  mode: z.enum(["discuss", "drilldown", "evaluate"]),
  message: z.string().trim().min(1).max(4000).optional(),
});

const DIRECTIVES = {
  drilldown: DRILLDOWN_DIRECTIVE,
  evaluate: EVALUATE_DIRECTIVE,
} as const;

export async function POST(request: Request) {
  // Gate before the stream opens so an unauthorized caller gets a real 401,
  // not a 200 event stream carrying an error (mirrors /api/agent/chat).
  // streamEditorialTurnEvents asserts again itself — defense in depth.
  try {
    await assertToolAccess("editorial-inquiry");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { questionId, mode, message } = parsed.data;
  const userMessage = mode === "discuss" ? message : DIRECTIVES[mode];
  if (!userMessage) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: EditorialTurnStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const event of streamEditorialTurnEvents(questionId, mode, userMessage)) {
          send(event);
        }
      } catch (error) {
        console.error("Editorial Inquiry turn failed:", error);
        const message =
          error instanceof ForbiddenError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Something went wrong.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
