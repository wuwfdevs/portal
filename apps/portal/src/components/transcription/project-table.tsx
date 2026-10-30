import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { projectProgress } from "@/lib/sourcework/project-stage";
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
            <Th>Progress</Th>
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
              <Cell label="Progress">
                <ProjectProgressCell stage={row.stage} />
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
                {row.reviewCount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-ink-700">
                    {row.reviewCount} to review
                  </p>
                )}
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}

/**
 * How far along a project is, as the same five steps its own page shows (Sources, Analyze, Review,
 * Synthesis, Piece): the bar is the steps finished, the lighter stretch the one under way, and the
 * word under it says which. A project with no sources has no bar to fill, so it shows the word alone.
 */
function ProjectProgressCell({ stage }: { stage: ProjectOverviewRow["stage"] }) {
  const progress = projectProgress(stage);
  const text = `${progress.done} of ${progress.total} steps done`;
  return (
    <div className="flex w-36 flex-col gap-1 max-md:w-full">
      <ProgressBar
        size="md"
        label="Project progress"
        done={progress.done}
        pending={progress.inProgress}
        total={progress.total}
        complete={progress.complete}
        valueText={`${text}${progress.label ? `, ${progress.label}` : ""}`}
      />
      <span className="text-xs text-ink-500">{progress.label}</span>
    </div>
  );
}
