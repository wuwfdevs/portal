"use server";

// Studio actions, invoked imperatively from studio-client.tsx rather than as
// <form action> submissions — every call here needs a live result to react
// to (join the call, flip the record button), not a page redirect. So
// unlike the parent route's actions.ts (whose failIfError/failWith bounce
// back to a rendered page via ?error=), these return a plain
// { ok, data | message } result, the same shape join/[token]/actions.ts
// already uses for the same reason (completePreflight et al.).

import { assertToolAccess } from "@/lib/auth/authz";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import {
  createMeetingToken,
  ensureRoom,
  isCloudBackupConfigured,
} from "@/lib/remote-interview/daily";
import {
  getSessionById,
  listActiveParticipants,
  nextRunIndex,
} from "@/lib/remote-interview/sessions";
import type { RiSession } from "@/lib/remote-interview/sessions";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireHostSession(sessionId: string, profileId: string): Promise<RiSession> {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error("That session doesn't exist.");
  if (session.created_by !== profileId) throw new Error("Only the session's host can do that.");
  return session;
}

export interface StudioCredentials {
  roomUrl: string;
  token: string;
  participantId: string;
  cloudBackupConfigured: boolean;
  session: RiSession;
}

/** Mints the host's own Daily join credentials, creating the room if this is the first visit to the studio. */
export async function getStudioCallCredentials(
  sessionId: string,
): Promise<ActionResult<StudioCredentials>> {
  const { profile } = await assertToolAccess("remote-interview");

  let session: RiSession;
  try {
    session = await requireHostSession(sessionId, profile.id);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not open the studio.",
    };
  }

  const participants = await listActiveParticipants(sessionId);
  const host = participants.find((p) => p.role === "host" && p.profile_id === profile.id);
  if (!host) return { ok: false, message: "You aren't an admitted participant in this session." };

  try {
    const room = await ensureRoom(session.id);
    const token = await createMeetingToken({
      roomName: room.name,
      userName: host.display_name,
      isOwner: true,
      participantId: host.id,
    });
    return {
      ok: true,
      data: {
        roomUrl: room.url,
        token,
        participantId: host.id,
        cloudBackupConfigured: isCloudBackupConfigured(),
        session,
      },
    };
  } catch (err) {
    console.error("getStudioCallCredentials failed:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not reach the call provider.",
    };
  }
}

export interface AdmittedParticipant {
  id: string;
  displayName: string;
  role: "host" | "guest";
  storagePrefix: string;
}

/**
 * Admits a waiting guest from inside the studio, so the host doesn't have to
 * leave the live call — and lose their own connection — to let someone in
 * (design doc §3C). Same admission rule as the session detail page's
 * admitParticipant (../actions.ts); this is that action's imperative-result
 * twin, for a client component to react to instead of following a redirect.
 */
export async function admitWaitingParticipant(
  sessionId: string,
  participantId: string,
): Promise<ActionResult<AdmittedParticipant>> {
  const { profile } = await assertToolAccess("remote-interview");

  try {
    await requireHostSession(sessionId, profile.id);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not admit the guest.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ri_participants")
    .update({ admitted_at: new Date().toISOString() })
    .eq("id", participantId)
    .eq("session_id", sessionId)
    .select("id, display_name, role, storage_prefix")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Could not admit the guest." };
  }

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.participant.admitted",
    targetType: "ri_participant",
    targetId: participantId,
    metadata: { session_id: sessionId },
  });

  return {
    ok: true,
    data: {
      id: data.id,
      displayName: data.display_name,
      role: data.role,
      storagePrefix: data.storage_prefix,
    },
  };
}

export interface RecordingStarted {
  runIndex: number;
  referenceStartedAtMs: number;
  cloudBackupConfigured: boolean;
}

/**
 * Starts a recording run: the reference clock (set once, kept across
 * stop/restart cycles — design doc §6 "Track synchronization"), a
 * cloud-backup ri_tracks row per admitted participant, and the session_event
 * that makes this auditable. Does NOT touch Daily's recording or any
 * participant's local capture directly — those happen client-side in
 * studio-client.tsx right after this resolves, so a failure here never
 * leaves the call layer and the database disagreeing about whether
 * recording is on.
 */
export async function startStudioRecording(
  sessionId: string,
): Promise<ActionResult<RecordingStarted>> {
  const { profile } = await assertToolAccess("remote-interview");

  let session: RiSession;
  try {
    session = await requireHostSession(sessionId, profile.id);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not start recording.",
    };
  }
  if (session.status === "recording") {
    return { ok: false, message: "Recording is already in progress." };
  }

  const participants = await listActiveParticipants(sessionId);
  if (participants.length === 0) {
    return { ok: false, message: "Admit at least one participant before recording." };
  }

  const runIndex = await nextRunIndex(sessionId);
  const referenceStartedAt = session.recording_started_at ?? new Date().toISOString();
  const cloudBackupConfigured = isCloudBackupConfigured();

  const supabase = await createClient();
  const { error: sessionError } = await supabase
    .from("ri_sessions")
    .update({
      status: "recording",
      recording_started_at: referenceStartedAt,
      recording_stopped_at: null,
    })
    .eq("id", sessionId);
  if (sessionError) {
    return { ok: false, message: `Could not start recording: ${sessionError.message}` };
  }

  if (cloudBackupConfigured) {
    const { error: tracksError } = await supabase.from("ri_tracks").insert(
      participants.map((p) => ({
        participant_id: p.id,
        source: "cloud" as const,
        run_index: runIndex,
        status: "recording" as const,
      })),
    );
    if (tracksError) {
      // Non-fatal: the local masters are the primary deliverable (design
      // doc §2); a cloud-backup bookkeeping failure shouldn't block them.
      console.error("Could not create cloud-backup track rows:", tracksError);
    }
  }

  await supabase.from("ri_session_events").insert({
    session_id: sessionId,
    kind: "recording_started",
    detail: { run_index: runIndex, cloud_backup_configured: cloudBackupConfigured },
  });

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.session.recording_started",
    targetType: "ri_session",
    targetId: sessionId,
    metadata: { run_index: runIndex },
  });

  return {
    ok: true,
    data: {
      runIndex,
      referenceStartedAtMs: new Date(referenceStartedAt).getTime(),
      cloudBackupConfigured,
    },
  };
}

/**
 * Stops the current recording run. Cloud-backup tracks move to "uploading"
 * — Daily assembles and delivers raw-tracks output to the destination
 * bucket asynchronously after the recorder stops, and there's no webhook
 * wired up yet to confirm that finished (that, plus local-master assembly,
 * is slice 4's job) — "uploading" is the honest terminal state here, not a
 * claim of completion.
 */
export async function stopStudioRecording(
  sessionId: string,
): Promise<ActionResult<{ stoppedAt: string }>> {
  const { profile } = await assertToolAccess("remote-interview");

  let session: RiSession;
  try {
    session = await requireHostSession(sessionId, profile.id);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not stop recording." };
  }
  if (session.status !== "recording") {
    return { ok: false, message: "Recording isn't in progress." };
  }

  const stoppedAt = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ri_sessions")
    .update({ status: "processing", recording_stopped_at: stoppedAt })
    .eq("id", sessionId);
  if (error) {
    return { ok: false, message: `Could not stop recording: ${error.message}` };
  }

  const participants = await listActiveParticipants(sessionId);
  if (participants.length > 0) {
    await supabase
      .from("ri_tracks")
      .update({ status: "uploading" })
      .eq("source", "cloud")
      .eq("status", "recording")
      .in(
        "participant_id",
        participants.map((p) => p.id),
      );
  }

  await supabase.from("ri_session_events").insert({
    session_id: sessionId,
    kind: "recording_stopped",
    detail: {},
  });

  await logAuditEvent({
    actorId: profile.id,
    action: "ri.session.recording_stopped",
    targetType: "ri_session",
    targetId: sessionId,
  });

  return { ok: true, data: { stoppedAt } };
}
