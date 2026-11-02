import { getBoundParticipant } from "@/lib/remote-interview/guest";
import { isJoinLinkActive } from "@/lib/remote-interview/tokens";
import { Alert } from "@/components/ui/alert";
import { Call } from "./call";
import { GuestBootstrap } from "./guest-bootstrap";
import { GuestShell } from "./guest-shell";
import { PreflightForm } from "./preflight-form";
import { WaitingRoom } from "./waiting-room";

/**
 * Guest-facing join link (design doc §3B/§3C/§3D/§3E; "Fit with portal
 * conventions" for why this lives outside both (portal) and (auth)). State
 * is derived entirely from the participant row, which is why there's no
 * client-side routing here: revoked/expired → error, admitted → the call
 * (slice 3), waiting_since set → waiting room, otherwise → preflight.
 * GuestBootstrap handles the one case none of this can: no session bound
 * yet at all.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const participant = await getBoundParticipant(token);

  if (!participant) {
    return <GuestBootstrap token={token} />;
  }

  if (
    !isJoinLinkActive({
      revokedAt: participant.revoked_at,
      tokenExpiresAt: participant.token_expires_at,
    })
  ) {
    return (
      <GuestShell>
        <Alert>
          {participant.revoked_at
            ? "This link has been revoked. Ask the host to send you a new one."
            : "This link has expired. Ask the host to send you a new one."}
        </Alert>
      </GuestShell>
    );
  }

  if (participant.admitted_at) {
    return (
      <Call
        token={token}
        participantId={participant.id}
        displayName={participant.display_name}
        storagePrefix={participant.storage_prefix}
      />
    );
  }

  if (participant.waiting_since) {
    return <WaitingRoom participantId={participant.id} displayName={participant.display_name} />;
  }

  return (
    <PreflightForm
      participantId={participant.id}
      sessionId={participant.session_id}
      initialDisplayName={participant.display_name}
    />
  );
}
