"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { field, optionalField } from "@/lib/form-fields";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { invokeCapability } from "@/lib/capabilities/registry";
import { createSession as createSessionCapability } from "@/lib/remote-interview/capabilities";
import {
  defaultTokenExpiry,
  generateJoinToken,
  storagePrefixFor,
} from "@/lib/remote-interview/tokens";
import { getSessionById, refreshSessionCompletionStatus } from "@/lib/remote-interview/sessions";
import { assembleLocalTrack } from "@/lib/remote-interview/assembly";

const SESSIONS_PATH = "/remote-interview";

/**
 * Thin adapter over the remote-interview.session.create capability: parse
 * FormData, call it, map the typed result back to failWith()/redirect()
 * exactly as this action did before the capability was extracted.
 */
export async function createSession(formData: FormData): Promise<void> {
  const result = await invokeCapability(createSessionCapability, {
    title: field(formData, "title"),
    notes: optionalField(formData, "notes") ?? undefined,
    scheduledAt: optionalField(formData, "scheduled_at") ?? undefined,
  });
  if (!result.ok) {
    failWith(`${SESSIONS_PATH}/new`, result.error);
  }

  redirect(`${SESSIONS_PATH}/${result.sessionId}`);
}

/** Only the session's creator can add a guest link (design doc §3A) — checked here for a clear message, and enforced independently by ri_participants' RLS insert policy. */
async function requireHost(sessionId: string, profileId: string, sessionPath: string) {
  const session = await getSessionById(sessionId);
  if (!session) {
    failWith(SESSIONS_PATH, "That session doesn't exist.");
  }
  if (session.created_by !== profileId) {
    failWith(sessionPath, "Only the session's host can do that.");
  }
  return session;
}

export async function addParticipant(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("remote-interview");
  const sessionId = field(formData, "session_id");
  const sessionPath = `${SESSIONS_PATH}/${sessionId}`;
  await requireHost(sessionId, profile.id, sessionPath);

  const displayName = field(formData, "display_name");
  if (!displayName) {
    failWith(sessionPath, "Give the guest a name.");
  }

  const supabase = await createClient();
  const participantId = randomUUID();
  const { error } = await supabase.from("ri_participants").insert({
    id: participantId,
    session_id: sessionId,
    display_name: displayName,
    role: "guest",
    join_token: generateJoinToken(),
    token_expires_at: defaultTokenExpiry().toISOString(),
    storage_prefix: storagePrefixFor(sessionId, participantId),
  });
  failIfError(error, sessionPath, "Could not create the guest link");

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.participant.added",
    targetType: "ri_participant",
    targetId: participantId,
    metadata: { session_id: sessionId, display_name: displayName },
  });

  redirect(sessionPath);
}

/**
 * Admits a guest who's finished preflight and is waiting (design doc §3C):
 * "Nobody joins an interview that has already started without the host
 * knowing." This is the only place admitted_at is ever set — a guest cannot
 * set it on their own row; see ri_guest_join_waiting_room()'s comment in
 * supabase/migrations/20260729180000_remote_interview_waiting_room.sql.
 */
export async function admitParticipant(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("remote-interview");
  const sessionId = field(formData, "session_id");
  const sessionPath = `${SESSIONS_PATH}/${sessionId}`;
  await requireHost(sessionId, profile.id, sessionPath);

  const participantId = field(formData, "participant_id");
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("ri_participants")
    .update({ admitted_at: new Date().toISOString() })
    .eq("id", participantId)
    .eq("session_id", sessionId)
    .select("id");
  failIfError(error, sessionPath, "Could not admit the guest");
  if (!updated?.length) failWith(sessionPath, "That guest isn't part of this session.");

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.participant.admitted",
    targetType: "ri_participant",
    targetId: participantId,
    metadata: { session_id: sessionId },
  });

  redirect(sessionPath);
}

/** Revoking a link is immediate and doesn't disturb any other participant (design doc §3A). */
export async function revokeParticipant(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("remote-interview");
  const sessionId = field(formData, "session_id");
  const sessionPath = `${SESSIONS_PATH}/${sessionId}`;
  await requireHost(sessionId, profile.id, sessionPath);

  const participantId = field(formData, "participant_id");
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("ri_participants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", participantId)
    .eq("session_id", sessionId)
    .select("id");
  failIfError(error, sessionPath, "Could not revoke the link");
  if (!updated?.length) failWith(sessionPath, "That guest isn't part of this session.");

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.participant.revoked",
    targetType: "ri_participant",
    targetId: participantId,
    metadata: { session_id: sessionId },
  });

  redirect(sessionPath);
}

/**
 * Assembles (or re-assembles) a local master from its uploaded parts —
 * design doc §3E/§3F: the host sees which tracks are complete and can
 * "retry a failed assembly." Host-only, same as every other recording
 * control, even though the track being assembled may belong to a guest —
 * see the migration broadening ri_media_insert/update for exactly this.
 */
export async function assembleTrack(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("remote-interview");
  const sessionId = field(formData, "session_id");
  const sessionPath = `${SESSIONS_PATH}/${sessionId}`;
  await requireHost(sessionId, profile.id, sessionPath);

  const trackId = field(formData, "track_id");
  const result = await assembleLocalTrack(trackId);
  await refreshSessionCompletionStatus(sessionId);
  if (!result.ok) {
    failWith(sessionPath, result.error);
  }

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.track.assembled",
    targetType: "ri_track",
    targetId: trackId,
    metadata: { session_id: sessionId },
  });

  redirect(sessionPath);
}
