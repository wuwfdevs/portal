import { notFound, redirect } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getSessionById, listActiveParticipants } from "@/lib/remote-interview/sessions";
import { StudioClient } from "./studio-client";

/**
 * The live screen (design doc §4, §3D). Host-only — a guest never reaches
 * (portal) routes at all (no profile), and no second staff member can join
 * this session's Daily room in this slice (only the host's own participant
 * row gets a call token — see studio/actions.ts), so anyone but the host
 * lands back on the session detail page rather than a half-working studio.
 */
export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireToolAccess("remote-interview");
  const { id } = await params;

  const session = await getSessionById(id);
  if (!session) notFound();

  if (session.created_by !== profile.id) {
    redirect(
      `/remote-interview/${id}?error=${encodeURIComponent("Only the session's host can open the studio.")}`,
    );
  }

  const participants = await listActiveParticipants(id);

  return (
    <StudioClient
      sessionId={session.id}
      sessionTitle={session.title}
      initialStatus={session.status}
      initialRecordingStartedAt={session.recording_started_at}
      participants={participants.map((p) => ({
        id: p.id,
        displayName: p.display_name,
        role: p.role,
        storagePrefix: p.storage_prefix,
      }))}
    />
  );
}
