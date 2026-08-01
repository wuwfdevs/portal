import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";

// Document-kind excerpts (docs/sourcework-design.md §8.7) — a source-scoped
// list function and summary type, parallel to lib/transcription/clips.ts's
// ProjectClip/listExcerptsForSource but for the page/block locator shape
// instead of start_ms/end_ms.

export interface DocumentExcerptLocation {
  sequence: number;
  pageNumber: number;
  blockId: string | null;
  startOffset: number | null;
  endOffset: number | null;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

export interface DocumentExcerptSummary {
  id: string;
  title: string;
  excerpt: string;
  createdAt: string;
  locations: DocumentExcerptLocation[];
  /** Every page this excerpt spans, ascending. */
  pages: number[];
}

/**
 * A document source's excerpts, independent of which project is open — the
 * document-workspace counterpart to listExcerptsForSource. Every excerpt's
 * ordered locations are fetched alongside it, since a single excerpt card
 * always shows its full span (pages, and where available, per-region
 * highlights) rather than paginating locations separately.
 */
export async function listDocumentExcerptsForSource(sourceId: string): Promise<DocumentExcerptSummary[]> {
  const supabase = await createClient();

  const excerpts = unwrapRead(
    await supabase
      .from("sw_source_excerpts")
      .select("id, title, excerpt_text, created_at")
      .eq("source_id", sourceId)
      .eq("locator_kind", "document")
      .order("created_at"),
    "this source's document excerpts",
  );
  if (!excerpts || excerpts.length === 0) return [];

  const excerptIds = excerpts.map((e) => e.id);
  const locations =
    unwrapRead(
      await supabase
        .from("sw_excerpt_document_locations")
        .select("excerpt_id, sequence, page_number, block_id, start_offset, end_offset, bbox")
        .in("excerpt_id", excerptIds)
        .order("sequence"),
      "these excerpts' locations",
    ) ?? [];

  const locationsByExcerptId = new Map<string, DocumentExcerptLocation[]>();
  for (const location of locations) {
    const list = locationsByExcerptId.get(location.excerpt_id) ?? [];
    list.push({
      sequence: location.sequence,
      pageNumber: location.page_number,
      blockId: location.block_id,
      startOffset: location.start_offset,
      endOffset: location.end_offset,
      bbox: location.bbox,
    });
    locationsByExcerptId.set(location.excerpt_id, list);
  }

  return excerpts.map((excerpt) => {
    const excerptLocations = locationsByExcerptId.get(excerpt.id) ?? [];
    return {
      id: excerpt.id,
      title: excerpt.title,
      excerpt: excerpt.excerpt_text,
      createdAt: excerpt.created_at,
      locations: excerptLocations,
      pages: [...new Set(excerptLocations.map((l) => l.pageNumber))].sort((a, b) => a - b),
    };
  });
}
