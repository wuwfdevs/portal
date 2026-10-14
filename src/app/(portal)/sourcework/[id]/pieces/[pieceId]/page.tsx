import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { TextLink } from "@/components/ui/primary-link";
import { projectPath } from "@/lib/transcription/links";
import { getPieceDetail, listPickerExcerpts } from "@/lib/sourcework/piece-queries";
import { listLiveFormats } from "@/lib/sourcework/piece-format-queries";
import { PieceEditorHost } from "./piece-editor";

/**
 * One piece: a block editor over narration and the project's excerpts
 * (docs/sourcework-analysis-design.md §6.2). Built by hand by default; an empty piece
 * can be outlined and a piece with beats written out (§22), and the assistant can edit it
 * (§6.4). Every save is a version.
 */
export default async function PiecePage({
  params,
}: {
  params: Promise<{ id: string; pieceId: string }>;
}) {
  await requireToolAccess("transcription");
  const { id, pieceId } = await params;

  const piece = await getPieceDetail(pieceId);
  if (!piece || piece.projectId !== id) notFound();
  // Formats are listed always: a piece can be written to one by hand, and an outline can follow one.
  const [pickerExcerpts, formats] = await Promise.all([
    listPickerExcerpts(piece.projectId),
    listLiveFormats(),
  ]);

  return (
    <div className="max-w-5xl px-4 py-8 sm:px-10 sm:py-10">
      <div className="mb-4">
        <TextLink href={projectPath(piece.projectId, "pieces")}>
          ← {piece.projectTitle} · Pieces
        </TextLink>
      </div>
      <h1 className="sr-only">{piece.title}</h1>
      {/* The host starts the editor again when the assistant, an outline or a write-out saves, not for the person's own autosaves. */}
      <PieceEditorHost
        piece={piece}
        pickerExcerpts={pickerExcerpts}
        formats={formats.map((format) => ({ id: format.id, name: format.name, spec: format.spec }))}
      />
    </div>
  );
}
