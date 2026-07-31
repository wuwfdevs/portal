import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { assertActiveProfile, ForbiddenError } from "@/lib/auth/authz";
import { runAgentTurn } from "@/lib/agent/chat";

/**
 * Phase D's chat endpoint (docs/agent-capabilities-design.md §7): the portal
 * agent's server route. Auth is the same cookie-based Supabase session every
 * page/action uses — mirrors src/app/api/mcp/route.ts's assertActiveProfile
 * gate, since this route is itself just another MCP client (see
 * src/lib/agent/mcp-client.ts) rather than a private shortcut into the
 * capability registry.
 *
 * Stateless like every other capability caller: the client echoes back the
 * full `history` each call (see components/agent-chat-widget.tsx) — there is
 * still no job queue or chat-history table in this repo, so nothing here
 * persists a transcript beyond the mcp.* audit event each tool call already
 * writes.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
});

const bodySchema = z.object({
  history: z.array(messageSchema).max(200),
  input: z.string().trim().min(1).max(4000).optional(),
  confirmation: z.object({ toolUseId: z.string().min(1), approved: z.boolean() }).optional(),
});

export async function POST(request: Request) {
  let profile;
  try {
    profile = await assertActiveProfile();
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

  const { history, input, confirmation } = parsed.data;
  if (!input && !confirmation) {
    return NextResponse.json({ error: "Provide a message or a confirmation." }, { status: 400 });
  }

  try {
    const result = await runAgentTurn(profile, {
      history: history as Anthropic.MessageParam[],
      input,
      confirmation,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
