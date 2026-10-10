import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { TextLink } from "@/components/ui/primary-link";
import { projectPath } from "@/lib/transcription/links";
import { getPieceDetail, listPickerExcerpts } from "@/lib/sourcework/piece-queries";
import { listLiveFormats } from "@/lib/sourcework/piece-format-queries";
import { loadMaterialSummary } from "@/lib/sourcework/piece-draft-run";
import { describeFormat } from "@/lib/sourcework/piece-formats";
import { PieceEditor } from "./piece-editor";

/**
 * One piece: a block editor over narration and the project's excerpts
 * (docs/sourcework-analysis-design.md §6.2). Built by hand by default; an empty piece
 * can be drafted from a format (§6.3), and the assistant can edit it (§6.4). Every save
 * is a version.
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
  const blank = piece.blocks.length === 0;
  // Draft with AI is offered only on an empty piece (§6.1), so only an empty one reads what it offers.
  const [pickerExcerpts, formats, material] = await Promise.all([
    listPickerExcerpts(piece.projectId),
    blank ? listLiveFormats() : Promise.resolve([]),
    blank ? loadMaterialSummary(piece.projectId) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-5xl px-4 py-8 sm:px-10 sm:py-10">
      <div className="mb-4">
        <TextLink href={projectPath(piece.projectId, "pieces")}>
          ← {piece.projectTitle} · Pieces
        </TextLink>
      </div>
      <h1 className="sr-only">{piece.title}</h1>
      {/* Keyed by version: when the assistant or a draft saves, the editor starts again from what was saved. */}
      <PieceEditor
        key={piece.version}
        piece={piece}
        pickerExcerpts={pickerExcerpts}
        draftFormats={formats.map((format) => ({
          id: format.id,
          name: format.name,
          description: describeFormat(format.spec),
        }))}
        draftMaterial={material}
      />
    </div>
  );
}
