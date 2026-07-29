"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import {
  defaultTokenExpiry,
  generateJoinToken,
  storagePrefixFor,
} from "@/lib/remote-interview/tokens";
import { getSessionById } from "@/lib/remote-interview/sessions";

const SESSIONS_PATH = "/remote-interview";

/**
 * Creates a session and its host participant row together. The host is a
 * participant like any guest (design doc §2), just one that's already
 * authenticated through the portal and admitted immediately — no waiting
 * room, no token expiry, since profile_id (not the join token) is how a host
 * proves who they are.
 */
export async function createSession(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("remote-interview");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    failWith(`${SESSIONS_PATH}/new`, "Give the session a title.");
  }
  const notes = String(formData.get("notes") ?? "").trim();
  const scheduledAt = String(formData.get("scheduled_at") ?? "").trim();

  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("ri_sessions")
    .insert({
      title,
      notes: notes || null,
      scheduled_at: scheduledAt || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(sessionError, `${SESSIONS_PATH}/new`, "Could not create the session");
  if (!session)
    failWith(`${SESSIONS_PATH}/new`, "Could not create the session — no row was created.");

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
  failIfError(
    hostError,
    `${SESSIONS_PATH}/new`,
    "Created the session, but could not add you as host",
  );

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.session.created",
    targetType: "ri_session",
    targetId: session.id,
    metadata: { title },
  });

  redirect(`${SESSIONS_PATH}/${session.id}`);
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
  const sessionId = String(formData.get("session_id") ?? "");
  const sessionPath = `${SESSIONS_PATH}/${sessionId}`;
  await requireHost(sessionId, profile.id, sessionPath);

  const displayName = String(formData.get("display_name") ?? "").trim();
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
  const sessionId = String(formData.get("session_id") ?? "");
  const sessionPath = `${SESSIONS_PATH}/${sessionId}`;
  await requireHost(sessionId, profile.id, sessionPath);

  const participantId = String(formData.get("participant_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("ri_participants")
    .update({ admitted_at: new Date().toISOString() })
    .eq("id", participantId)
    .eq("session_id", sessionId);
  failIfError(error, sessionPath, "Could not admit the guest");

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
  const sessionId = String(formData.get("session_id") ?? "");
  const sessionPath = `${SESSIONS_PATH}/${sessionId}`;
  await requireHost(sessionId, profile.id, sessionPath);

  const participantId = String(formData.get("participant_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("ri_participants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", participantId)
    .eq("session_id", sessionId);
  failIfError(error, sessionPath, "Could not revoke the link");

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.participant.revoked",
    targetType: "ri_participant",
    targetId: participantId,
    metadata: { session_id: sessionId },
  });

  redirect(sessionPath);
}
