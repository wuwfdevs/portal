import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { formatShortDate } from "@/lib/format";
import type { ProjectOverviewRow } from "@/lib/transcription/projects";
import { overviewStatus, overviewStatusMap } from "@/lib/transcription/status";

function startedBy(row: ProjectOverviewRow, currentUserId: string): string {
  if (row.createdBy === currentUserId) return "You";
  return row.startedByName ?? "A teammate";
}

/**
 * One page of projects. A server component: filtering, paging and counts are
 * the query's job (see listProjectsPage), so there is nothing to do in the
 * browser, and the whole row is the link.
 */
export function ProjectTable({
  rows,
  currentUserId,
  emptyMessage,
}: {
  rows: ProjectOverviewRow[];
  currentUserId: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) return <EmptyState>{emptyMessage}</EmptyState>;

  return (
    <TableFrame>
      <Table stack className="md:min-w-[760px]">
        <thead>
          <HeaderRow>
            <Th>Project</Th>
            <Th>Sources</Th>
            <Th>Excerpts</Th>
            <Th>Started by</Th>
            <Th>Last activity</Th>
            <Th>Status</Th>
          </HeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.id} className="relative hover:bg-panel-50">
              <Cell stack="title">
                <Link
                  href={`/sourcework/${row.id}`}
                  className="font-semibold text-brand-link after:absolute after:inset-0"
                >
                  {row.title}
                </Link>
                {row.description && (
                  <p className="mt-0.5 max-w-md truncate text-xs text-ink-400 max-md:max-w-none max-md:whitespace-normal">
                    {row.description}
                  </p>
                )}
              </Cell>
              <Cell label="Sources" className="text-ink-500">
                {row.sourceCount}
              </Cell>
              <Cell label="Excerpts" className="text-ink-500">
                {row.excerptCount}
              </Cell>
              <Cell label="Started by" className="whitespace-nowrap text-ink-500">
                {startedBy(row, currentUserId)}
              </Cell>
              <Cell label="Last activity" className="whitespace-nowrap text-ink-500">
                {formatShortDate(row.lastActivity, { year: true })}
              </Cell>
              <Cell stack="aside">
                <StatusBadge map={overviewStatusMap} value={overviewStatus(row)} />
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}
