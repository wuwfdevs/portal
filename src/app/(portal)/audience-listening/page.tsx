import { requireToolAccess } from "@/lib/auth/authz";
import { listQueries } from "@/lib/audience-listening/queries";
import { QUERY_STATUS_BADGE } from "@/lib/audience-listening/review";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { formatShortDate } from "@/lib/format";

export default async function AudienceListeningPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireToolAccess("audience-listening");
  const { error } = await searchParams;
  const queries = await listQueries();

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-8"
        title="Audience Listening"
        description="Recorded callouts you publish into a story, and the responses that come back — grouped by participant, with consent on the record."
        actions={<PrimaryLink href="/audience-listening/new">New query</PrimaryLink>}
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      {queries.length === 0 ? (
        <EmptyState className="leading-relaxed">
          No queries yet. Create one, add up to five questions, and you&apos;ll get a public link
          and an embed to drop into a story.
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack className="md:min-w-[820px]">
            <thead>
              <HeaderRow>
                <Th>Query</Th>
                <Th>Status</Th>
                <Th className="text-right">Questions</Th>
                <Th className="text-right">Submissions</Th>
                <Th className="text-right">Unreviewed</Th>
                <Th>Owner</Th>
                <Th>Updated</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {queries.map(
                ({ query, ownerName, questionCount, submissionCount, unreviewedCount }) => {
                  const badge = QUERY_STATUS_BADGE[query.status];
                  return (
                    <Row key={query.id}>
                      <Cell stack="title">
                        <TextLink
                          href={`/audience-listening/${query.id}`}
                          className="px-0 font-semibold"
                        >
                          {query.internal_title}
                        </TextLink>
                        <p className="mt-0.5 max-w-md truncate text-xs text-ink-400">
                          {query.public_title}
                        </p>
                      </Cell>
                      <Cell stack="aside">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </Cell>
                      <Cell label="Questions" className="text-right text-ink-500">
                        {questionCount}
                      </Cell>
                      <Cell label="Submissions" className="text-right text-ink-500">
                        {submissionCount}
                      </Cell>
                      <Cell label="Unreviewed" className="text-right">
                        {unreviewedCount > 0 ? (
                          <span className="font-semibold text-ink-900">{unreviewedCount}</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </Cell>
                      <Cell label="Owner" className="whitespace-nowrap text-ink-500">
                        {ownerName ?? "—"}
                      </Cell>
                      <Cell label="Updated" className="whitespace-nowrap text-ink-500">
                        {formatShortDate(query.updated_at, { year: true })}
                      </Cell>
                    </Row>
                  );
                },
              )}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
