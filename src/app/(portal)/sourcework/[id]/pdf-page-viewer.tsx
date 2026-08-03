"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";

// pdfjs-dist ships as a plain top-level dependency here (pinned to the exact
// version react-pdf@10 bundles internally, so the main-thread and worker
// builds can't drift apart — see the version-mismatch warning in react-pdf's
// own README). The worker must be configured in this same module, per that
// README: setting it elsewhere and importing react-pdf afterward can lose
// the assignment to module-execution-order.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * The rendered PDF page itself — split out from document-workspace.tsx and
 * loaded via next/dynamic(..., { ssr: false }) there, since pdfjs-dist's
 * browser build touches DOM/canvas APIs (DOMMatrix, Path2D) that don't exist
 * during Next's server render pass (see docs/sourcework-design.md §8.5 and
 * react-pdf's own Next.js integration note).
 *
 * No text or annotation layer from pdfjs itself: the reading pane next to
 * this one (built from sw_document_blocks, not pdfjs's own text extraction)
 * is where selection and excerpt creation happen — see
 * DocumentWorkspace's own comment on why.
 */
export function PdfPageViewer({
  fileUrl,
  pageNumber,
  scale,
  fitWidth,
  highlightBbox,
  onLoadError,
  onLoadPageCount,
}: {
  fileUrl: string;
  pageNumber: number;
  scale: number;
  /**
   * The viewer container's measured width in CSS px, if known. react-pdf
   * computes the rendered page's scale as `scale * (fitWidth / pageWidth)`
   * when both are given (see its Page.js), so this is the "fit to
   * container" baseline and `scale` is the zoom control's multiplier on top
   * of it — 100% zoom means "fills the container," not "the PDF's native
   * point size," which is what actually fits a phone screen. Without this a
   * standard Letter page renders ~816px wide regardless of viewport, wider
   * than any phone, forcing sideways scrolling just to read it.
   */
  fitWidth?: number;
  /**
   * A block's location on this page, fractional to the page's own
   * width/height (see document-normalization.ts) — outlined on top of the
   * rendered page when the reading pane's text is clicked. Fractional
   * rather than pixel-based so the outline stays aligned at any zoom
   * without recomputation. Null/undefined hides it.
   */
  highlightBbox?: { x0: number; y0: number; x1: number; y1: number } | null;
  onLoadError?: (message: string) => void;
  /** The PDF's own page count. The workspace normally paginates by the extracted sw_document_pages rows, but when extraction failed there are none — this is the only page count available. */
  onLoadPageCount?: (pageCount: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Document
      file={fileUrl}
      loading={<p className="p-4 text-sm text-ink-500">Loading page…</p>}
      onLoadSuccess={(doc) => onLoadPageCount?.(doc.numPages)}
      onLoadError={(err) => {
        const message = "Could not display this PDF.";
        setError(message);
        onLoadError?.(message);
        console.error("[sourcework] pdf load failed", err);
      }}
    >
      {error ? (
        <p className="p-4 text-sm text-ink-500">{error}</p>
      ) : (
        // inline-block so this wrapper shrink-wraps to the rendered page's
        // own size, which is what makes the highlight's percentage-based
        // positioning below line up with the canvas underneath it.
        <div className="relative inline-block">
          <Page
            pageNumber={pageNumber}
            scale={scale}
            width={fitWidth || undefined}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<p className="p-4 text-sm text-ink-500">Loading page…</p>}
          />
          {highlightBbox && (
            <div
              className="pointer-events-none absolute border-2 border-brand-primary bg-brand-primary/20"
              style={{
                left: `${highlightBbox.x0 * 100}%`,
                top: `${highlightBbox.y0 * 100}%`,
                width: `${Math.max(0, (highlightBbox.x1 - highlightBbox.x0) * 100)}%`,
                height: `${Math.max(0, (highlightBbox.y1 - highlightBbox.y0) * 100)}%`,
              }}
            />
          )}
        </div>
      )}
    </Document>
  );
}
