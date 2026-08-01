"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, FieldError } from "@/components/ui/input";
import {
  resolveDocumentSelection,
  type DocumentSelectionAnchor,
  type DocumentSelectionLocation,
  type SelectableBlock,
} from "@/lib/transcription/document-selection";
import type { DocumentBlockSummary, DocumentPageSummary } from "@/lib/transcription/document-content";
import type { DocumentExcerptSummary } from "@/lib/transcription/document-excerpts";
import {
  createDocumentExcerpt,
  deleteDocumentExcerpt,
} from "./document-excerpt-actions";

const PdfPageViewer = dynamic(() => import("./pdf-page-viewer").then((mod) => mod.PdfPageViewer), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-ink-500">Loading viewer…</p>,
});

const BLOCK_TYPE_CLASS: Record<string, string> = {
  heading: "font-serif text-lg font-bold text-ink-900",
  title: "font-serif text-lg font-bold text-ink-900",
  caption: "text-xs italic text-ink-500",
  header: "text-xs uppercase tracking-wide text-ink-400",
  footer: "text-xs uppercase tracking-wide text-ink-400",
  table: "font-mono text-xs whitespace-pre-wrap text-ink-700",
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;

export function DocumentWorkspace({
  sourceId,
  representationId,
  fileUrl,
  pages,
  blocks,
  excerpts,
  initialPage,
}: {
  sourceId: string;
  representationId: string | null;
  fileUrl: string;
  pages: DocumentPageSummary[];
  blocks: DocumentBlockSummary[];
  excerpts: DocumentExcerptSummary[];
  initialPage?: number | null;
}) {
  const router = useRouter();
  const pageCount = pages.length;
  const [currentPage, setCurrentPage] = useState(
    Math.min(Math.max(initialPage ?? 1, 1), Math.max(pageCount, 1)),
  );
  const [zoom, setZoom] = useState(1);
  const [pendingSelection, setPendingSelection] = useState<{
    excerpt: string;
    locations: DocumentSelectionLocation[];
  } | null>(null);
  const [excerptTitle, setExcerptTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  const blocksByPage = useMemo(() => {
    const map = new Map<number, DocumentBlockSummary[]>();
    for (const block of blocks) {
      const list = map.get(block.pageNumber) ?? [];
      list.push(block);
      map.set(block.pageNumber, list);
    }
    return map;
  }, [blocks]);

  const selectableBlocks: SelectableBlock[] = useMemo(
    () => blocks.map((b) => ({ id: b.id, pageNumber: b.pageNumber, readingOrder: b.readingOrder, text: b.text })),
    [blocks],
  );

  function handleMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !paneRef.current) return;
    if (!paneRef.current.contains(selection.anchorNode) || !paneRef.current.contains(selection.focusNode)) {
      return;
    }

    const anchor = resolveAnchor(selection.anchorNode, selection.anchorOffset);
    const focus = resolveAnchor(selection.focusNode, selection.focusOffset);
    if (!anchor || !focus) return;

    const resolved = resolveDocumentSelection(selectableBlocks, anchor, focus);
    if (!resolved) return;

    setPendingSelection(resolved);
    setExcerptTitle("");
    setError(null);
  }

  async function handleSaveExcerpt() {
    if (!pendingSelection) return;
    const title = excerptTitle.trim();
    if (!title) {
      setError("Give the excerpt a title.");
      return;
    }

    setSaving(true);
    setError(null);
    const blockById = new Map(blocks.map((b) => [b.id, b]));
    const result = await createDocumentExcerpt({
      sourceId,
      representationId,
      title,
      excerptText: pendingSelection.excerpt,
      locations: pendingSelection.locations.map((location) => ({
        pageNumber: location.pageNumber,
        blockId: location.blockId,
        startOffset: location.startOffset,
        endOffset: location.endOffset,
        bbox: blockById.get(location.blockId)?.bbox ?? null,
      })),
    });
    setSaving(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPendingSelection(null);
    setExcerptTitle("");
    window.getSelection()?.removeAllRanges();
    router.refresh();
  }

  async function handleDeleteExcerpt(excerptId: string) {
    await deleteDocumentExcerpt(excerptId);
    router.refresh();
  }

  const orderedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </Button>
          <span className="text-sm text-ink-700">
            Page{" "}
            <input
              type="number"
              min={1}
              max={pageCount}
              value={currentPage}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setCurrentPage(Math.min(Math.max(next, 1), pageCount));
              }}
              className="w-12 rounded border border-line px-1 py-0.5 text-center text-base sm:text-sm"
            />{" "}
            of {pageCount}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={currentPage >= pageCount}
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
          >
            Next →
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          >
            −
          </Button>
          <span className="text-xs text-ink-500">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="secondary"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          >
            +
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="max-h-[75vh] overflow-auto rounded border border-line bg-panel-50">
          <PdfPageViewer fileUrl={fileUrl} pageNumber={currentPage} scale={zoom} />
        </div>

        <div className="flex max-h-[75vh] flex-col gap-4 overflow-auto">
          <div
            ref={paneRef}
            onMouseUp={handleMouseUp}
            className="select-text rounded border border-line bg-white p-4 text-sm leading-relaxed text-ink-800"
          >
            {orderedPages.map((page) => (
              <div key={page.id} className="mb-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Page {page.pageNumber}
                </p>
                {(blocksByPage.get(page.pageNumber) ?? []).map((block) => (
                  <p
                    key={block.id}
                    data-block-id={block.id}
                    className={`mb-2 ${BLOCK_TYPE_CLASS[block.blockType] ?? ""}`}
                  >
                    {block.text}
                  </p>
                ))}
              </div>
            ))}
          </div>

          {pendingSelection && (
            <div className="rounded border border-brand-primary bg-brand-surface p-3">
              <p className="mb-2 line-clamp-3 text-xs italic text-ink-700">
                &ldquo;{pendingSelection.excerpt}&rdquo;
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Excerpt title"
                  value={excerptTitle}
                  onChange={(event) => setExcerptTitle(event.target.value)}
                  className="max-w-xs"
                />
                <Button type="button" onClick={handleSaveExcerpt} disabled={saving}>
                  {saving ? "Saving…" : "Save excerpt"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPendingSelection(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                >
                  Cancel
                </Button>
              </div>
              {error && <FieldError>{error}</FieldError>}
            </div>
          )}

          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
              Excerpts from this document
            </h2>
            {excerpts.length === 0 ? (
              <p className="text-sm text-ink-500">
                Select text above and save it as an excerpt to see it here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {excerpts.map((excerpt) => (
                  <li key={excerpt.id} className="rounded border border-line bg-white p-3">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                      <button
                        type="button"
                        className="text-left font-semibold text-brand-link"
                        onClick={() => setCurrentPage(excerpt.pages[0] ?? currentPage)}
                      >
                        {excerpt.title}
                      </button>
                      <span className="text-xs text-ink-400">
                        {excerpt.pages.length === 1 ? `p. ${excerpt.pages[0]}` : `pp. ${excerpt.pages.join(", ")}`}
                      </span>
                    </div>
                    {excerpt.excerpt && (
                      <p className="line-clamp-2 text-sm text-ink-700">{excerpt.excerpt}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteExcerpt(excerpt.id)}
                      className="mt-1 text-xs text-ink-400 hover:text-danger"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Walks a Selection endpoint's node up to its nearest `[data-block-id]` ancestor. Each block renders its text as a single text-node child, so the raw DOM offset is already the character offset into that block's text. */
function resolveAnchor(node: Node | null, offset: number): DocumentSelectionAnchor | null {
  let element: Node | null = node;
  while (element && element.nodeType !== Node.ELEMENT_NODE) element = element.parentNode;
  const blockElement = (element as Element | null)?.closest("[data-block-id]");
  const blockId = blockElement?.getAttribute("data-block-id");
  if (!blockId) return null;
  return { blockId, offset };
}
