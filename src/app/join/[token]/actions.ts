"use server";

import { bindGuestParticipant, joinWaitingRoom, logPreflightResult } from "@/lib/remote-interview/guest";

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
