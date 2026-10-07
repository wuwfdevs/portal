import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import {
  countParticipantsBySession,
  listSessions,
  type RiSession,
} from "@/lib/remote-interview/sessions";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryLink } from "@/components/ui/primary-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { SESSION_STATUS } from "@/lib/remote-interview/track-status";
import { formatShortDate } from "@/lib/format";

function formatSessionDate(session: RiSession): string {
  const source = session.scheduled_at ?? session.created_at;
  return formatShortDate(source, { year: true });
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
      <PageHeader
        size="page"
        title="Remote Interview"
        description="Record a remote guest at full quality, straight from their own browser."
        actions={<PrimaryLink href="/remote-interview/new">New session</PrimaryLink>}
        className="mb-8"
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      {sessions.length === 0 ? (
        <EmptyState>
          No sessions yet. Start one and you&apos;ll get a guest link to send right away.
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack className="md:min-w-[640px]">
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
                return (
                  <Row key={session.id}>
                    <Cell stack="title">
                      <Link
                        href={`/remote-interview/${session.id}`}
                        className="font-semibold text-brand-link"
                      >
                        {session.title}
                      </Link>
                    </Cell>
                    <Cell label="Date" className="whitespace-nowrap text-ink-500">
                      {formatSessionDate(session)}
                    </Cell>
                    <Cell label="Participants" className="text-ink-500">
                      {participantCounts[session.id] ?? 0}
                    </Cell>
                    <Cell stack="aside">
                      <StatusBadge map={SESSION_STATUS} value={session.status} />
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
