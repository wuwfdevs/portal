"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, FieldError } from "@/components/ui/input";
import {
  bboxForOffsetRange,
  buildExcerptRuns,
  excerptAtOffset,
  resolveDocumentSelection,
  type DocumentSelectionAnchor,
  type DocumentSelectionLocation,
  type ExcerptCharRange,
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
  // Normally the extracted pages are the page count. When extraction failed
  // or hasn't run there are none, and the PDF itself is the only thing that
  // knows how long it is — the viewer reports that back once it loads, so
  // paging still works over a document with no text behind it.
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const pageCount = pages.length || pdfPageCount;
  const [currentPage, setCurrentPage] = useState(
    Math.min(Math.max(initialPage ?? 1, 1), Math.max(pages.length, 1)),
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
  // One pane at a time, mirroring TranscriptWorkspace's single reading
  // surface (the audio element there is hidden, not a second visible pane) —
  // the earlier side-by-side layout gave the rendered page and its extracted
  // text equal, permanent billing for a "verify OCR against the image"
  // interaction that wasn't actually built. See handleMouseUp's block click
  // and DocumentTab's badge for how that's handled without a split view.
  const [activeTab, setActiveTab] = useState<"document" | "text">("document");

  // The viewer container's own width, so the PDF can render to fit it
  // instead of at its native point size (~816px for a Letter page — wider
  // than any phone, which forced sideways scrolling just to read a page).
  // See PdfPageViewer's fitWidth comment.
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(0);
  useEffect(() => {
    const el = viewerContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setFitWidth(Math.floor(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Which block a click in the text pane last landed on — shown as an
  // outline on the rendered page (PdfPageViewer's highlightBbox) rather than
  // jumping the viewer to the Document tab, which would be a jarring forced
  // switch for what's meant to be an ambient "here's where that is" signal.
  // DocumentTab's badge is the discoverable part: it lights up the Document
  // tab when there's something waiting there instead of moving the reader.
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);
  // Which existing excerpt is "active" for the underline treatment below —
  // set by clicking inside its underlined text or its card in the rail.
  const [selectedExcerptId, setSelectedExcerptId] = useState<string | null>(null);
  const [hoveredExcerptId, setHoveredExcerptId] = useState<string | null>(null);

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

  // Every excerpt's coverage, indexed by the block it lands on — the
  // document counterpart to resolveClipCoverage, but built directly from the
  // stored character offsets rather than inferred from time.
  const excerptRangesByBlock = useMemo(() => {
    const map = new Map<string, ExcerptCharRange[]>();
    for (const excerpt of excerpts) {
      for (const location of excerpt.locations) {
        if (!location.blockId || location.startOffset === null || location.endOffset === null) continue;
        const list = map.get(location.blockId) ?? [];
        list.push({ excerptId: excerpt.id, startOffset: location.startOffset, endOffset: location.endOffset });
        map.set(location.blockId, list);
      }
    }
    return map;
  }, [excerpts]);

  function handleMouseUp() {
    const selection = window.getSelection();
    if (!selection || !paneRef.current) return;

    if (selection.isCollapsed) {
      // A plain click: point the PDF pane at this block, and if it landed
      // inside already-excerpted text, select that excerpt in the rail too —
      // the same two-purpose click segment-row.tsx's handleTextClick uses
      // for a clipped word.
      const anchor = resolveAnchor(selection.anchorNode, selection.anchorOffset);
      setHighlightedBlockId(anchor?.blockId ?? null);
      setSelectedExcerptId(
        anchor ? excerptAtOffset(excerptRangesByBlock.get(anchor.blockId) ?? [], anchor.offset) : null,
      );
      return;
    }

    if (!paneRef.current.contains(selection.anchorNode) || !paneRef.current.contains(selection.focusNode)) {
      return;
    }

    const anchor = resolveAnchor(selection.anchorNode, selection.anchorOffset);
    const focus = resolveAnchor(selection.focusNode, selection.focusOffset);
    if (!anchor || !focus) return;

    const resolved = resolveDocumentSelection(selectableBlocks, anchor, focus);
    if (!resolved) return;

    // Dragging out a new excerpt supersedes whichever block/excerpt was
    // merely marked — same precedent as the transcript's captureSelection.
    setHighlightedBlockId(null);
    setSelectedExcerptId(null);
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
      locations: pendingSelection.locations.map((location) => {
        const block = blockById.get(location.blockId);
        // Prefer a tight box around just the selected lines; fall back to
        // the whole block's own bbox when there's no finer geometry (an
        // OCR block, or a native block with no recoverable page
        // dimensions) — see bboxForOffsetRange's comment.
        const bbox =
          bboxForOffsetRange(block?.lines ?? [], location.startOffset, location.endOffset) ??
          block?.bbox ??
          null;
        return {
          pageNumber: location.pageNumber,
          blockId: location.blockId,
          startOffset: location.startOffset,
          endOffset: location.endOffset,
          bbox,
        };
      }),
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

  const currentPageData = pages.find((page) => page.pageNumber === currentPage) ?? null;
  // A block highlight only means something on the page it was set on — the
  // text pane only ever renders the current page's blocks anyway, but a page
  // turn elsewhere (Prev/Next, an excerpt card's jump) shouldn't leave a
  // stale outline pointing at a block that's no longer even shown.
  const highlightedBlock = blocks.find((block) => block.id === highlightedBlockId) ?? null;
  const activeHighlightedBlock =
    highlightedBlock && highlightedBlock.pageNumber === currentPage ? highlightedBlock : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
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

        <div className="flex gap-1.5">
          <DocumentTab
            label="Document"
            active={activeTab === "document"}
            badge={activeTab !== "document" && activeHighlightedBlock?.bbox != null}
            onClick={() => setActiveTab("document")}
          />
          <DocumentTab label="Text" active={activeTab === "text"} onClick={() => setActiveTab("text")} />
        </div>

        <div
          ref={viewerContainerRef}
          className={`min-w-0 max-h-[75vh] overflow-auto rounded border border-line bg-panel-50 ${
            activeTab === "document" ? "block" : "hidden"
          }`}
        >
          <PdfPageViewer
            fileUrl={fileUrl}
            pageNumber={currentPage}
            scale={zoom}
            fitWidth={fitWidth}
            highlightBbox={activeHighlightedBlock?.bbox ?? null}
            onLoadPageCount={setPdfPageCount}
          />
        </div>

        <div
          className={`min-w-0 max-h-[75vh] overflow-auto ${activeTab === "text" ? "block" : "hidden"}`}
        >
          <div
            ref={paneRef}
            onMouseUp={handleMouseUp}
            className="min-w-0 select-text break-words rounded border border-line bg-white p-4 text-sm leading-relaxed text-ink-800"
          >
            {pages.length === 0 && (
              // Not necessarily an error: text extraction may have failed
              // (the banner above says so) or may still be running. Either
              // way the page renders fine on the Document tab, so say what's
              // missing rather than leaving an empty panel.
              <p className="text-sm text-ink-500">
                No text for this document yet — you can read and page through it on the Document tab, but
                there&apos;s nothing to select or excerpt until extraction finishes.
              </p>
            )}
            {currentPageData &&
              (blocksByPage.get(currentPageData.pageNumber) ?? []).map((block) => {
                const runs = buildExcerptRuns(block.text, excerptRangesByBlock.get(block.id) ?? []);
                return (
                  <p
                    key={block.id}
                    data-block-id={block.id}
                    className={`mb-2 ${BLOCK_TYPE_CLASS[block.blockType] ?? ""} ${
                      highlightedBlockId === block.id ? "rounded bg-brand-surface/60" : ""
                    }`}
                  >
                    {runs.map((run, index) => (
                      <span
                        key={index}
                        className={excerptMarkClass(
                          excerptRunMark(run.excerptIds, selectedExcerptId, hoveredExcerptId),
                        )}
                      >
                        {run.text}
                      </span>
                    ))}
                  </p>
                );
              })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
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
                <li
                  key={excerpt.id}
                  // Clicking anywhere on the card marks its underlined text
                  // in the reading pane and jumps to its first page — same
                  // "the whole card is the control" reasoning as ClipCard
                  // (a nested Delete button rules out making this a button).
                  onClick={() => {
                    setSelectedExcerptId(excerpt.id);
                    setHighlightedBlockId(null);
                    setActiveTab("text");
                    setCurrentPage(excerpt.pages[0] ?? currentPage);
                  }}
                  onMouseEnter={() => setHoveredExcerptId(excerpt.id)}
                  onMouseLeave={() => setHoveredExcerptId(null)}
                  onFocus={() => setHoveredExcerptId(excerpt.id)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setHoveredExcerptId(null);
                    }
                  }}
                  className={`rounded border bg-white p-3 ${
                    selectedExcerptId === excerpt.id ? "border-brand-primary ring-2 ring-brand-surface" : "border-line"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-left font-semibold text-brand-link">{excerpt.title}</span>
                    <span className="text-xs text-ink-400">
                      {excerpt.pages.length === 1 ? `p. ${excerpt.pages[0]}` : `pp. ${excerpt.pages.join(", ")}`}
                    </span>
                  </div>
                  {excerpt.excerpt && (
                    <p className="line-clamp-2 text-sm text-ink-700">{excerpt.excerpt}</p>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteExcerpt(excerpt.id);
                    }}
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
  );
}

function DocumentTab({
  label,
  active,
  badge = false,
  onClick,
}: {
  label: string;
  active: boolean;
  /** A small dot signalling "there's a highlight waiting on this tab" — ambient, not a forced switch. See highlightedBlockId's comment. */
  badge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-full border px-3 py-1 text-xs font-semibold ${
        active
          ? "border-brand-primary bg-brand-surface text-brand-link"
          : "border-line text-ink-500 hover:text-ink-700"
      }`}
    >
      {label}
      {badge && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-primary" aria-hidden="true" />
      )}
    </button>
  );
}

/** Weakest to strongest, the order these states override each other — mirrors segment-row.tsx's MARK_ORDER/tokenMark. */
type ExcerptMark = "none" | "excerpted" | "hovered" | "selected";

function excerptRunMark(
  excerptIds: string[],
  selectedExcerptId: string | null,
  hoveredExcerptId: string | null,
): ExcerptMark {
  if (excerptIds.length === 0) return "none";
  if (selectedExcerptId && excerptIds.includes(selectedExcerptId)) return "selected";
  if (hoveredExcerptId && excerptIds.includes(hoveredExcerptId)) return "hovered";
  return "excerpted";
}

/**
 * Two channels, not two shades — same reasoning as segment-row.tsx's
 * markClass. "This is already excerpted" is an ambient underline that's on
 * for every excerpted run at once and survives excerpts overlapping (one
 * underline whether one excerpt covers a run or three); the tint is spent
 * only on whichever excerpt is currently active.
 */
function excerptMarkClass(mark: ExcerptMark): string {
  switch (mark) {
    case "selected":
      return "border-b-2 border-clipped-line bg-clipped-selected";
    case "hovered":
      return "border-b-2 border-clipped-line bg-clipped-hover";
    case "excerpted":
      return "border-b-2 border-clipped-line/60";
    default:
      return "";
  }
}

/**
 * Walks a Selection endpoint's node up to its nearest `[data-block-id]`
 * ancestor, and its block-relative character offset by summing every text
 * node that comes before it in that block — a block's text is now split
 * across one `<span>` run per excerpt-coverage boundary (buildExcerptRuns)
 * rather than always being a single text node, so the browser's per-node
 * offset alone isn't the block-relative offset resolveDocumentSelection
 * expects.
 */
function resolveAnchor(node: Node | null, offset: number): DocumentSelectionAnchor | null {
  if (!node) return null;
  let element: Node | null = node;
  while (element && element.nodeType !== Node.ELEMENT_NODE) element = element.parentNode;
  const blockElement = (element as Element | null)?.closest("[data-block-id]");
  const blockId = blockElement?.getAttribute("data-block-id");
  if (!blockId || !blockElement) return null;

  let blockOffset = offset;
  const walker = document.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode()) && current !== node) {
    blockOffset += current.textContent?.length ?? 0;
  }

  return { blockId, offset: blockOffset };
}
