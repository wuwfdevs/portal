import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";

export type RiSession = Database["public"]["Tables"]["ri_sessions"]["Row"];
export type RiParticipant = Database["public"]["Tables"]["ri_participants"]["Row"];
export type RiSessionEvent = Database["public"]["Tables"]["ri_session_events"]["Row"];

export interface PreflightResult {
  warnings: { code: string; severity: string }[];
  deviceLabel: string | null;
  userAgent: string | null;
  occurredAt: string;
}

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

/**
 * Guests who've finished preflight and are waiting to be let in (design doc
 * §3C) — unrevoked, not yet admitted, oldest first so the host sees who's
 * been waiting longest at the top.
 */
export async function listWaitingParticipants(sessionId: string): Promise<RiParticipant[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("ri_participants")
        .select("*")
        .eq("session_id", sessionId)
        .eq("role", "guest")
        .is("revoked_at", null)
        .is("admitted_at", null)
        .not("waiting_since", "is", null)
        .order("waiting_since", { ascending: true }),
      "the waiting room",
    ) ?? []
  );
}

/**
 * The latest preflight_completed event per participant, for the waiting-room
 * view (design doc §3C: "with their preflight results"). A guest can in
 * principle re-run preflight and re-submit, so this keeps only the newest
 * event per participant rather than showing history here — the full history
 * is still in ri_session_events for anyone who needs it.
 */
export async function getLatestPreflightResults(
  sessionId: string,
): Promise<Record<string, PreflightResult>> {
  const supabase = await createClient();
  const rows = unwrapRead(
    await supabase
      .from("ri_session_events")
      .select("*")
      .eq("session_id", sessionId)
      .eq("kind", "preflight_completed")
      .order("occurred_at", { ascending: false }),
    "preflight results",
  );

  const results: Record<string, PreflightResult> = {};
  for (const row of rows ?? []) {
    if (!row.participant_id || results[row.participant_id]) continue;
    const detail = row.detail as {
      warnings?: { code: string; severity: string }[];
      device_label?: string | null;
      user_agent?: string | null;
    };
    results[row.participant_id] = {
      warnings: detail.warnings ?? [],
      deviceLabel: detail.device_label ?? null,
      userAgent: detail.user_agent ?? null,
      occurredAt: row.occurred_at,
    };
  }
  return results;
}
