import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";

export type RiSession = Database["public"]["Tables"]["ri_sessions"]["Row"];
export type RiParticipant = Database["public"]["Tables"]["ri_participants"]["Row"];

/**
 * Sessions visible to the current user, newest first. RLS scopes this to
 * remote-interview tool members (private.has_remote_interview_access) — a
 * shared workspace, same trust model as the Transcription Workspace's
 * project list, not a per-host inbox.
 */
export async function listSessions(): Promise<RiSession[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.from("ri_sessions").select("*").order("created_at", { ascending: false }),
      "the session list",
    ) ?? []
  );
}

export async function getSessionById(id: string): Promise<RiSession | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("ri_sessions").select("*").eq("id", id).maybeSingle(),
    "this session",
  );
}

/** A session's participants (host and guests), in join order. */
export async function listParticipants(sessionId: string): Promise<RiParticipant[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("ri_participants")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      "this session's participants",
    ) ?? []
  );
}

/**
 * Participant count per session, for the session list row (design doc §4).
 * One flat query across every session the user can see rather than N+1 —
 * this is a small newsroom tool, so a client-side reduce is simpler than a
 * grouped RPC.
 */
export async function countParticipantsBySession(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const rows = unwrapRead(
    await supabase.from("ri_participants").select("session_id"),
    "participant counts",
  );

  const counts: Record<string, number> = {};
  for (const row of rows ?? []) {
    counts[row.session_id] = (counts[row.session_id] ?? 0) + 1;
  }
  return counts;
}
