import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SourceRowMenu } from "./source-row-menu";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import type { SwSourceKind } from "@/lib/database.types";
import type { ExtractionLine } from "@/lib/sourcework/run-state";
import {
  projectStatusMap,
  SOURCE_KIND_LABEL,
  type ProjectStatus,
} from "@/lib/transcription/status";

export interface SourceTableRow {
  id: string;
  href: string;
  title: string;
  kind: SwSourceKind;
  status: ProjectStatus;
  /** "Oct 3, 2026": when it was recorded or added. */
  date: string;
  /** "38:12" or "14 pages"; empty when unknown. */
  length: string;
  analysis: ExtractionLine | null;
  /** Why a failed source failed, in a line. */
  footnote?: string;
}

/**
 * A project's sources as a list that scales: one scannable row each, the whole row a link, with a
 * failed source's reason under its title. Below `md` each row stacks into a card (docs/ui-patterns.md,
 * "Tables on narrow screens"). The same row shape the Source library's cards show, in a form that
 * holds twenty sources as readably as three.
 */
export function SourceTable({
  projectId,
  rows,
  emptyMessage,
}: {
  projectId: string;
  rows: SourceTableRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) return <EmptyState>{emptyMessage}</EmptyState>;

  return (
    <TableFrame>
      <Table stack className="md:min-w-[720px]">
        <thead>
          <HeaderRow>
            <Th>Source</Th>
            <Th>Length</Th>
            <Th>Status</Th>
            <Th>Analysis</Th>
            <Th className="w-10 px-2">
              <span className="sr-only">Actions</span>
            </Th>
          </HeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.id} className="relative hover:bg-panel-50">
              <Cell stack="title">
                <Link
                  href={row.href}
                  className="font-semibold text-brand-link after:absolute after:inset-0"
                >
                  {row.title}
                </Link>
                <p className="mt-0.5 text-xs text-ink-400">
                  {SOURCE_KIND_LABEL[row.kind] ?? row.kind} · {row.date}
                </p>
                {row.footnote && <p className="mt-1 text-xs text-danger">{row.footnote}</p>}
              </Cell>
              <Cell label="Length" className="whitespace-nowrap text-ink-500">
                {row.length || "—"}
              </Cell>
              <Cell label="Status">
                <StatusBadge map={projectStatusMap(row.kind)} value={row.status} />
              </Cell>
              <Cell label="Analysis" className="text-ink-700">
                {row.analysis ? (
                  <>
                    {row.analysis.text}
                    {row.analysis.strong && (
                      <strong className="font-semibold text-ink-900">{row.analysis.strong}</strong>
                    )}
                  </>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </Cell>
              {/* Its own last column, so the menu sits at the row's right edge on a table and in the card's top corner on a phone. */}
              <Cell stack="aside" className="relative z-10 px-2 text-right">
                <SourceRowMenu
                  projectId={projectId}
                  sourceId={row.id}
                  sourceTitle={row.title}
                  href={row.href}
                />
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}
