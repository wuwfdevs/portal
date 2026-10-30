import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type RiParticipant = Database["public"]["Tables"]["ri_participants"]["Row"];

/**
 * Ensures the current browser holds a Supabase session — signing in
 * anonymously if it doesn't already — then binds the join token's
 * participant row to that session's uid via the security-definer
 * ri_bind_guest_participant() function (see
 * supabase/migrations/20260729180000_remote_interview_waiting_room.sql for
 * why this can't be a plain RLS-scoped update: an unbound anonymous user
 * can't yet SELECT the row it's trying to claim).
 *
 * Returns null for any invalid token (revoked, expired, not a guest row, or
 * simply wrong) — deliberately not distinguishing why; the guest-facing
 * screen shows one message either way.
 */
export async function bindGuestParticipant(token: string): Promise<RiParticipant | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      // Most likely cause: anonymous sign-in isn't enabled for this Supabase
      // project yet — see docs/remote-interview-design.md, "Guest identity"
      // ("must be enabled per Supabase project in the dashboard").
      console.error("Anonymous sign-in failed:", signInError);
      return null;
    }
  }

  const { data, error } = await supabase.rpc("ri_bind_guest_participant", { p_token: token });
  if (error) {
    console.error("ri_bind_guest_participant failed:", error);
    return null;
  }
  return data;
}

/**
 * The current session's own participant row for this token, if bound.
 * Deliberately checks for a session before querying: table-level SELECT on
 * ri_participants is granted to `authenticated` only (see the schema
 * migration), so an anonymous request with no session at all would get a
 * permission-denied error, not an empty result — and that's an expected,
 * routine state here (first visit, before GuestBootstrap has run), not an
 * outage to report. Once there IS a session, a query error is a real
 * problem and is thrown for the route's error.tsx to show, per CLAUDE.md's
 * rule against swallowing Supabase errors.
 */
export async function getBoundParticipant(token: string): Promise<RiParticipant | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("ri_participants")
    .select("*")
    .eq("join_token", token)
    .maybeSingle();
  if (error) {
    console.error("Failed to look up guest participant:", error);
    throw new Error(`Could not load this join link: ${error.message}`);
  }
  return data;
}

/**
 * Records preflight completion and moves the participant into the waiting
 * room. Uses the security-definer ri_guest_join_waiting_room() function so a
 * guest can never write any column but display_name/waiting_since on their
 * own row — see the migration comment for why a plain RLS update policy
 * would be unsafe here (it would also let a guest set their own admitted_at).
 */
export async function joinWaitingRoom(
  participantId: string,
  displayName: string | null,
): Promise<RiParticipant | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ri_guest_join_waiting_room", {
    p_participant_id: participantId,
    p_display_name: displayName,
  });
  if (error) {
    console.error("ri_guest_join_waiting_room failed:", error);
    return null;
  }
  return data;
}

/**
 * Records what preflight found, for the host's waiting-room view (design doc
 * §3C: "with their preflight results"). Insert-only, permitted by the
 * existing ri_session_events RLS policy for a bound participant acting on
 * themselves — no new policy needed.
 */
export async function logPreflightResult(params: {
  sessionId: string;
  participantId: string;
  warnings: { code: string; severity: string }[];
  deviceLabel: string | null;
  userAgent: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("ri_session_events").insert({
    session_id: params.sessionId,
    participant_id: params.participantId,
    kind: "preflight_completed",
    detail: {
      warnings: params.warnings,
      device_label: params.deviceLabel,
      user_agent: params.userAgent,
    },
  });
  if (error) {
    // Non-fatal: the guest's join shouldn't fail because the host-facing
    // preflight summary couldn't be logged.
    console.error("Failed to log preflight_completed event:", error);
  }
}
