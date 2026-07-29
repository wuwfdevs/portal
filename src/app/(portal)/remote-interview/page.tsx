import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import {
  countParticipantsBySession,
  listSessions,
  type RiSession,
} from "@/lib/remote-interview/sessions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import type { RiSessionStatus } from "@/lib/database.types";

const STATUS_BADGE: Record<
  RiSessionStatus,
  { label: string; variant: "accent" | "neutral" | "muted" | "danger" }
> = {
  scheduled: { label: "Scheduled", variant: "neutral" },
  live: { label: "Live", variant: "accent" },
  recording: { label: "Recording", variant: "accent" },
  processing: { label: "Processing", variant: "neutral" },
  ready: { label: "Ready", variant: "accent" },
  needs_recovery: { label: "Needs recovery", variant: "danger" },
  failed: { label: "Failed", variant: "danger" },
};

function formatSessionDate(session: RiSession): string {
  const source = session.scheduled_at ?? session.created_at;
  return new Date(source).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function RemoteInterviewListPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireToolAccess("remote-interview");
  const { error } = await searchParams;

  const [sessions, participantCounts] = await Promise.all([
    listSessions(),
    countParticipantsBySession(),
  ]);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 font-serif text-[28px] font-bold text-ink-900">Remote Interview</h1>
          <p className="max-w-xl text-[15px] text-ink-500">
            Record a remote guest at full quality, straight from their own browser.
          </p>
        </div>
        <Link href="/remote-interview/new">
          <Button>New session</Button>
        </Link>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      {sessions.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm leading-relaxed text-ink-500">
          No sessions yet. Start one and you&apos;ll get a guest link to send right away.
        </div>
      ) : (
        <TableFrame>
          <Table className="min-w-[640px]">
            <thead>
              <HeaderRow>
                <Th>Title</Th>
                <Th>Date</Th>
                <Th>Participants</Th>
                <Th>Status</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const badge = STATUS_BADGE[session.status];
                return (
                  <Row key={session.id}>
                    <Cell>
                      <Link
                        href={`/remote-interview/${session.id}`}
                        className="font-semibold text-brand-link"
                      >
                        {session.title}
                      </Link>
                    </Cell>
                    <Cell className="whitespace-nowrap text-ink-500">
                      {formatSessionDate(session)}
                    </Cell>
                    <Cell className="text-ink-500">{participantCounts[session.id] ?? 0}</Cell>
                    <Cell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
