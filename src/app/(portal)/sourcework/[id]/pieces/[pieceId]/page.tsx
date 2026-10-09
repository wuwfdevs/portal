import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { TextLink } from "@/components/ui/primary-link";
import { projectPath } from "@/lib/transcription/links";
import { getPieceDetail, listPickerExcerpts } from "@/lib/sourcework/piece-queries";
import { PieceEditor } from "./piece-editor";

/**
 * One piece: a block editor over narration and the project's excerpts
 * (docs/sourcework-analysis-design.md §6.2). Everything on it is built by hand;
 * every save is a version.
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
  const pickerExcerpts = await listPickerExcerpts(piece.projectId);

  return (
    <div className="max-w-5xl px-4 py-8 sm:px-10 sm:py-10">
      <div className="mb-4">
        <TextLink href={projectPath(piece.projectId, "pieces")}>
          ← {piece.projectTitle} · Pieces
        </TextLink>
      </div>
      <h1 className="sr-only">{piece.title}</h1>
      <PieceEditor piece={piece} pickerExcerpts={pickerExcerpts} />
    </div>
  );
}
