import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { formatClock, formatShortDate } from "@/lib/format";
import { piecePath } from "@/lib/transcription/links";
import type { PieceListRow } from "@/lib/sourcework/piece-queries";
import { createPiece } from "./pieces/actions";

/**
 * The project's pieces (docs/sourcework-analysis-design.md §6). A new piece
 * starts blank and opens straight into the editor — the button is a form
 * because creating a row is a write, not a navigation.
 */
export function PiecesTab({
  projectId,
  pieces,
  search,
  totalCount,
}: {
  projectId: string;
  pieces: PieceListRow[];
  search: string;
  totalCount: number;
}) {
  return (
    <div>
      <ListToolbar
        className="mb-4"
        search={
          totalCount > 0
            ? {
                placeholder: "Search pieces",
                label: "Search pieces",
                defaultValue: search,
                hidden: { view: "pieces" },
              }
            : undefined
        }
      >
        <form action={createPiece}>
          <input type="hidden" name="project_id" value={projectId} />
          <Button type="submit" className="max-sm:min-h-11">
            + New piece
          </Button>
        </form>
      </ListToolbar>

      {pieces.length === 0 ? (
        <EmptyState>
          {search
            ? `No piece matches “${search}”.`
            : "No pieces yet. A piece is a wrap, voicer or script built from narration and this project’s excerpts."}
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack className="md:min-w-[640px]">
            <thead>
              <HeaderRow>
                <Th>Piece</Th>
                <Th className="md:w-56">Made with</Th>
                <Th className="md:w-28">Length</Th>
                <Th className="md:w-44">Updated</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {pieces.map((piece) => (
                <Row key={piece.id} className="relative hover:bg-panel-50">
                  <Cell stack="title">
                    <Link
                      href={piecePath(projectId, piece.id)}
                      className="font-semibold text-brand-link after:absolute after:inset-0"
                    >
                      {piece.title}
                    </Link>
                  </Cell>
                  {/* Pieces drafted from a format ("Radio wrap format, then edited") arrive with Phase E. */}
                  <Cell label="Made with" className="text-ink-500">
                    Written by hand
                  </Cell>
                  <Cell stack="aside" className="font-mono text-[13px]">
                    {formatClock(piece.lengthSeconds)}
                  </Cell>
                  <Cell label="Updated" className="whitespace-nowrap text-ink-500">
                    {formatShortDate(piece.updatedAt, { year: true })}
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}

      <p className="mt-3.5 max-w-xl text-[13px] text-ink-500">
        A new piece opens straight into the editor and starts blank. You build it from narration and
        excerpts.
      </p>
    </div>
  );
}
