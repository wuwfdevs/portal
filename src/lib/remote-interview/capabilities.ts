// Remote Interview's capability layer (docs/agent-capabilities-design.md §4,
// Phase B). Session creation is the write logic that used to live inline in
// (portal)/remote-interview/actions.ts's createSession — same authorization
// call, same writes, same audit event — now returning a typed result instead
// of calling failWith()/redirect() (meaningless outside a request/response
// cycle). That action is now a thin adapter: parse FormData, call this
// capability, map the result to failWith()/redirect() exactly as before.

import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertToolAccess } from "@/lib/auth/authz";
import { generateJoinToken, storagePrefixFor } from "./tokens";
import { logAuditEvent } from "@/lib/audit";

export type CreateSessionResult =
  | { ok: true; sessionId: string; url: string }
  | { ok: false; message: string };

/**
 * Creates a session and its host participant row together. The host is a
 * participant like any guest (design doc §2), just one that's already
 * authenticated through the portal and admitted immediately — no waiting
 * room, no token expiry, since profile_id (not the join token) is how a host
 * proves who they are.
 */
export const createSession = defineCapability({
  id: "remote-interview.session.create",
  summary: "Create a Remote Interview session and add the caller as its host",
  input: z.object({
    title: z.string().trim(),
    notes: z.string().trim().optional(),
    scheduledAt: z.string().trim().optional(),
  }),
  requires: { tool: "remote-interview" },
  confirmation: "none",
  async handler({ supabase }, input): Promise<CreateSessionResult> {
    const { profile } = await assertToolAccess("remote-interview");
    if (!input.title) return { ok: false, message: "Give the session a title." };

    const { data: session, error: sessionError } = await supabase
      .from("ri_sessions")
      .insert({
        title: input.title,
        notes: input.notes || null,
        scheduled_at: input.scheduledAt || null,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (sessionError) {
      console.error("Could not create the session:", sessionError);
      return { ok: false, message: `Could not create the session: ${sessionError.message}` };
    }
    if (!session) {
      return { ok: false, message: "Could not create the session — no row was created." };
    }

    const hostId = randomUUID();
    const { error: hostError } = await supabase.from("ri_participants").insert({
      id: hostId,
      session_id: session.id,
      display_name: profile.display_name,
      role: "host",
      profile_id: profile.id,
      join_token: generateJoinToken(),
      storage_prefix: storagePrefixFor(session.id, hostId),
      admitted_at: new Date().toISOString(),
    });
    if (hostError) {
      console.error("Created the session, but could not add host:", hostError);
      return {
        ok: false,
        message: `Created the session, but could not add you as host: ${hostError.message}`,
      };
    }

    await logAuditEvent({
      actorId: profile.id,
      action: "ri.session.created",
      targetType: "ri_session",
      targetId: session.id,
      metadata: { title: input.title },
    });
    return { ok: true, sessionId: session.id, url: `/remote-interview/${session.id}` };
  },
});
