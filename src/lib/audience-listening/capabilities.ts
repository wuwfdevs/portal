// Audience Listening's capability layer (docs/agent-capabilities-design.md
// §4, Phase B). Wraps the existing sendAnswerToTranscription() handoff
// (lib/audience-listening/handoff.ts) — already capability-shaped, a plain
// function that returns a typed result rather than redirecting — with audit
// logging that used to live in the Server Action
// (sendAnswerToTranscriptionAction). That action is now a thin adapter:
// parse FormData, invoke this capability with confirmed: true (the button
// that calls it is itself the confirmation), map the result to
// failWith()/redirect() exactly as before.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertToolAccess } from "@/lib/auth/authz";
import { logAuditEvent } from "@/lib/audit";
import { sendAnswerToTranscription, type HandoffResult } from "./handoff";

export type SendToSourceworkResult = HandoffResult | { ok: true; projectId: string; url: string };

/**
 * Handing one answer to Sourcework — a one-way, billable-ASR-triggering
 * action, so it's confirmation-gated (design doc §6's confirmation-required
 * table). The handler is self-contained: it only needs the answer id, and
 * looks up the answer's query id itself for the audit event's metadata
 * rather than trusting a caller-supplied one.
 */
export const sendAnswerToSourcework = defineCapability({
  id: "audience-listening.answer.sendToSourcework",
  summary: "Copy one answer's audio into Sourcework and start transcription there",
  input: z.object({ answerId: z.string() }),
  requires: { tool: "audience-listening" },
  confirmation: "required",
  async handler({ supabase }, input): Promise<SendToSourceworkResult> {
    const { profile } = await assertToolAccess("audience-listening");
    const result = await sendAnswerToTranscription(input.answerId);
    if (!result.ok) return result;

    const { data: answer } = await supabase
      .from("al_answers")
      .select("query_id")
      .eq("id", input.answerId)
      .maybeSingle();

    await logAuditEvent({
      actorId: profile.id,
      action: "al.answer.sent_to_transcription",
      targetType: "al_answer",
      targetId: input.answerId,
      metadata: { query_id: answer?.query_id, project_id: result.projectId },
    });
    return { ...result, url: `/sourcework/${result.projectId}` };
  },
});
