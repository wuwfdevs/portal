import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import { listQueries } from "@/lib/audience-listening/queries";
import { QUERY_STATUS_BADGE } from "@/lib/audience-listening/review";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 font-serif text-[28px] font-bold text-ink-900">
            Audience Listening
          </h1>
          <p className="max-w-xl text-[15px] text-ink-500">
            Recorded callouts you publish into a story, and the responses that come back — grouped
            by participant, with consent on the record.
          </p>
        </div>
        <Link href="/audience-listening/new">
          <Button>New query</Button>
        </Link>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      {queries.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm leading-relaxed text-ink-500">
          No queries yet. Create one, add up to five questions, and you&apos;ll get a public link
          and an embed to drop into a story.
        </div>
      ) : (
        <TableFrame>
          <Table className="min-w-[820px]">
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
                      <Cell>
                        <Link
                          href={`/audience-listening/${query.id}`}
                          className="font-semibold text-brand-link"
                        >
                          {query.internal_title}
                        </Link>
                        <p className="mt-0.5 max-w-md truncate text-xs text-ink-400">
                          {query.public_title}
                        </p>
                      </Cell>
                      <Cell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </Cell>
                      <Cell className="text-right text-ink-500">{questionCount}</Cell>
                      <Cell className="text-right text-ink-500">{submissionCount}</Cell>
                      <Cell className="text-right">
                        {unreviewedCount > 0 ? (
                          <span className="font-semibold text-ink-900">{unreviewedCount}</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </Cell>
                      <Cell className="whitespace-nowrap text-ink-500">{ownerName ?? "—"}</Cell>
                      <Cell className="whitespace-nowrap text-ink-500">
                        {formatDate(query.updated_at)}
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
