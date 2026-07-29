import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getSessionById, listParticipants } from "@/lib/remote-interview/sessions";
import { isJoinLinkActive } from "@/lib/remote-interview/tokens";
import { getSiteUrl } from "@/lib/site-url";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { addParticipant } from "../actions";
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

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/remote-interview" className="text-xs font-semibold text-brand-link">
          ← Back to sessions
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1.5 font-serif text-[22px] font-bold text-ink-900">{session.title}</h1>
          {session.notes && <p className="max-w-xl text-sm text-ink-500">{session.notes}</p>}
        </div>
        <Badge variant="neutral">{session.status.replace("_", " ")}</Badge>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="max-w-xl rounded border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-serif text-[15px] font-bold text-ink-900">Participants</h2>
        </div>
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
      </div>
    </div>
  );
}
