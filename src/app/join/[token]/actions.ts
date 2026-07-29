"use server";

import {
  bindGuestParticipant,
  getBoundParticipant,
  joinWaitingRoom,
  logPreflightResult,
} from "@/lib/remote-interview/guest";
import { createMeetingToken, ensureRoom } from "@/lib/remote-interview/daily";

const INVALID_LINK_MESSAGE =
  "This link isn't valid, or it has expired or been revoked. Ask the host to send you a new one.";

export type BindResult = { ok: true } | { ok: false; message: string };

/**
 * Called once, client-side, on first load of /join/[token]: establishes an
 * anonymous session if the browser doesn't have one yet, then binds the
 * token's participant row to it. See lib/remote-interview/guest.ts for why.
 */
export async function bindGuestJoin(token: string): Promise<BindResult> {
  const participant = await bindGuestParticipant(token);
  if (!participant) {
    return { ok: false, message: INVALID_LINK_MESSAGE };
  }
  return { ok: true };
}

export type PreflightSubmission = {
  participantId: string;
  sessionId: string;
  displayName: string;
  warnings: { code: string; severity: string }[];
  deviceLabel: string | null;
  userAgent: string;
};

export type CompletePreflightResult = { ok: true } | { ok: false; message: string };

/** Marks preflight done and moves the guest into the waiting room (design doc §3B → §3C). */
export async function completePreflight(
  submission: PreflightSubmission,
): Promise<CompletePreflightResult> {
  const displayName = submission.displayName.trim();
  if (!displayName) {
    return { ok: false, message: "Enter your name before continuing." };
  }

  const participant = await joinWaitingRoom(submission.participantId, displayName);
  if (!participant) {
    return {
      ok: false,
      message: "Couldn't join the waiting room — this link may have been revoked. Reload the page.",
    };
  }

  await logPreflightResult({
    sessionId: submission.sessionId,
    participantId: submission.participantId,
    warnings: submission.warnings,
    deviceLabel: submission.deviceLabel,
    userAgent: submission.userAgent,
  });

  return { ok: true };
}

export type GuestCallCredentials = { roomUrl: string; token: string };
export type GetGuestCallTokenResult =
  { ok: true; data: GuestCallCredentials } | { ok: false; message: string };

/**
 * Mints a non-owner Daily join token for an admitted guest (design doc §3D:
 * guests can't start/stop recording — is_owner: false is what actually
 * enforces that on Daily's side, not just the UI hiding the button). Only
 * an admitted, bound, unrevoked participant for THIS token gets one — the
 * bind check re-runs here rather than trusting the caller's participantId,
 * since this is a guest-facing action with no session-cookie identity of
 * its own beyond the anonymous auth already established.
 */
export async function getGuestCallToken(token: string): Promise<GetGuestCallTokenResult> {
  const participant = await getBoundParticipant(token);
  if (!participant) {
    return { ok: false, message: INVALID_LINK_MESSAGE };
  }
  if (participant.revoked_at) {
    return { ok: false, message: INVALID_LINK_MESSAGE };
  }
  if (!participant.admitted_at) {
    return { ok: false, message: "You haven't been admitted yet." };
  }

  try {
    const room = await ensureRoom(participant.session_id);
    const token_ = await createMeetingToken({
      roomName: room.name,
      userName: participant.display_name,
      isOwner: false,
      participantId: participant.id,
    });
    return { ok: true, data: { roomUrl: room.url, token: token_ } };
  } catch (err) {
    console.error("getGuestCallToken failed:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not reach the call provider.",
    };
  }
}
