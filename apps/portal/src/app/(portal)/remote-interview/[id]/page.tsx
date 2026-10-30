import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import {
  getLatestPreflightResults,
  getSessionById,
  listParticipants,
  listResumedParticipantIds,
  listTracksForSession,
  listWaitingParticipants,
  type RiTrack,
} from "@/lib/remote-interview/sessions";
import { isJoinLinkActive } from "@/lib/remote-interview/tokens";
import { trackDownloadFilename } from "@/lib/remote-interview/media";
import { getSignedTrackUrl } from "@/lib/remote-interview/storage";
import {
  deriveTrackProvenance,
  SESSION_STATUS,
  TRACK_PROVENANCE_LABELS,
  trackStatusBadgeVariant,
} from "@/lib/remote-interview/track-status";
import { formatBytes } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import { getSiteUrl } from "@/lib/site-url";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryLink } from "@/components/ui/primary-link";
import { CardHeader } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Label } from "@/components/ui/input";
import { addParticipant, admitParticipant, assembleTrack } from "../actions";
import { CopyLinkButton } from "./copy-link-button";
import { RevokeLinkButton } from "./revoke-link-button";

export default async function RemoteInterviewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireToolAccess("remote-interview");
  const { id } = await params;
  const { error } = await searchParams;

  const session = await getSessionById(id);
  if (!session) notFound();

  const participants = await listParticipants(id);
  const isHost = session.created_by === profile.id;
  const siteUrl = getSiteUrl();

  const waitingParticipants = isHost ? await listWaitingParticipants(id) : [];
  const preflightResults = isHost ? await getLatestPreflightResults(id) : {};

  const tracks = await listTracksForSession(id);
  const resumedParticipantIds = await listResumedParticipantIds(id);
  const displayNameById = new Map(participants.map((p) => [p.id, p.display_name]));
  const downloadUrlByTrackId = new Map<string, string>();
  for (const track of tracks) {
    if (!track.storage_path) continue;
    const url = await getSignedTrackUrl(
      track.storage_path,
      trackDownloadFilename({
        displayName: displayNameById.get(track.participant_id) ?? "participant",
        source: track.source,
        runIndex: track.run_index,
        contentType: track.content_type,
      }),
    );
    if (url) downloadUrlByTrackId.set(track.id, url);
  }
  const anyDownloadableTrack = downloadUrlByTrackId.size > 0;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        className="mb-6"
        back={{ href: "/remote-interview", label: "Back to sessions" }}
        title={session.title}
        badge={<StatusBadge map={SESSION_STATUS} value={session.status} />}
        description={session.notes}
        actions={
          isHost && (
            <PrimaryLink href={`/remote-interview/${session.id}/studio`}>Open studio</PrimaryLink>
          )
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      {isHost && waitingParticipants.length > 0 && (
        <Card className="mb-6 max-w-xl">
          <CardHeader>
            <h2>Waiting room</h2>
          </CardHeader>
          <ul>
            {waitingParticipants.map((participant) => {
              const preflight = preflightResults[participant.id];
              return (
                <li key={participant.id} className="border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-semibold text-ink-900">
                        {participant.display_name}
                      </span>
                      {preflight?.deviceLabel && (
                        <p className="mt-0.5 text-xs text-ink-500">Mic: {preflight.deviceLabel}</p>
                      )}
                      {preflight && preflight.warnings.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {preflight.warnings.map((warning) => (
                            <Badge
                              key={warning.code}
                              variant={warning.severity === "blocking" ? "danger" : "muted"}
                            >
                              {warning.code.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {!preflight && (
                        <p className="mt-0.5 text-xs text-ink-400">
                          No preflight results recorded.
                        </p>
                      )}
                    </div>
                    <form action={admitParticipant}>
                      <input type="hidden" name="session_id" value={session.id} />
                      <input type="hidden" name="participant_id" value={participant.id} />
                      <Button type="submit" variant="secondary">
                        Admit
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="max-w-xl">
        <CardHeader>
          <h2>Participants</h2>
        </CardHeader>
        <ul>
          {participants.map((participant) => {
            const active = isJoinLinkActive({
              revokedAt: participant.revoked_at,
              tokenExpiresAt: participant.token_expires_at,
            });
            const joinLink = `${siteUrl}/join/${participant.join_token}`;

            return (
              <li key={participant.id} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-ink-900">
                      {participant.display_name}
                    </span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-ink-400">
                      {participant.role}
                    </span>
                  </div>
                  {participant.revoked_at ? (
                    <Badge variant="muted">Revoked</Badge>
                  ) : !active ? (
                    <Badge variant="muted">Expired</Badge>
                  ) : null}
                </div>

                {participant.role === "guest" && active && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <code className="max-w-full truncate rounded bg-panel-50 px-2 py-1 text-xs text-ink-500">
                      {joinLink}
                    </code>
                    <CopyLinkButton link={joinLink} />
                    {isHost && (
                      <RevokeLinkButton sessionId={session.id} participantId={participant.id} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {isHost && (
          <form
            action={addParticipant}
            className="flex flex-wrap items-end gap-3 border-t border-line px-4 py-3.5"
          >
            <input type="hidden" name="session_id" value={session.id} />
            <div className="flex-1">
              <Label htmlFor="display_name">Add a guest</Label>
              <Input
                id="display_name"
                name="display_name"
                placeholder="Dr. Okafor"
                required
                className="max-w-xs"
              />
            </div>
            <Button type="submit" variant="secondary">
              Create link
            </Button>
          </form>
        )}
      </Card>

      {tracks.length > 0 && (
        <Card className="mt-6 max-w-xl">
          <CardHeader>
            <h2>Recordings</h2>
            {anyDownloadableTrack && (
              <a
                href={`/api/remote-interview/sessions/${session.id}/tracks.zip`}
                className="text-xs font-semibold text-brand-link"
              >
                Download all
              </a>
            )}
          </CardHeader>
          <ul>
            {participants
              .filter((participant) => tracks.some((t) => t.participant_id === participant.id))
              .map((participant) => (
                <li key={participant.id} className="border-b border-line px-4 py-3 last:border-b-0">
                  <p className="mb-2 text-sm font-semibold text-ink-900">
                    {participant.display_name}
                  </p>
                  <div className="space-y-2">
                    {tracks
                      .filter((t) => t.participant_id === participant.id)
                      .map((track) => (
                        <TrackRow
                          key={track.id}
                          track={track}
                          sessionId={session.id}
                          isHost={isHost}
                          wasResumed={resumedParticipantIds.has(participant.id)}
                          downloadUrl={downloadUrlByTrackId.get(track.id) ?? null}
                        />
                      ))}
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function TrackRow({
  track,
  sessionId,
  isHost,
  wasResumed,
  downloadUrl,
}: {
  track: RiTrack;
  sessionId: string;
  isHost: boolean;
  wasResumed: boolean;
  downloadUrl: string | null;
}) {
  const provenance = deriveTrackProvenance(track, { wasResumed });
  const canAssemble =
    isHost &&
    track.source === "local" &&
    (track.status === "uploading" || track.status === "partial" || track.status === "failed");

  return (
    <div className="rounded border border-line bg-panel-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          {track.source === "local" ? "Local master" : "Cloud backup"} · run {track.run_index}
        </span>
        <Badge variant={trackStatusBadgeVariant(track.status)}>
          {TRACK_PROVENANCE_LABELS[provenance]}
        </Badge>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        {track.duration_ms != null && <span>{formatDuration(track.duration_ms)}</span>}
        {track.size_bytes != null && <span>{formatBytes(track.size_bytes)}</span>}
        {track.content_type && <span>{track.content_type}</span>}
      </div>

      {track.error_message && (
        <p className="mt-1.5 text-xs leading-relaxed text-danger">{track.error_message}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {downloadUrl && (
          <a href={downloadUrl} className="text-xs font-semibold text-brand-link">
            Download
          </a>
        )}
        {canAssemble && (
          <form action={assembleTrack}>
            <input type="hidden" name="session_id" value={sessionId} />
            <input type="hidden" name="track_id" value={track.id} />
            <Button type="submit" variant="secondary">
              {track.status === "uploading" ? "Assemble" : "Retry assembly"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
