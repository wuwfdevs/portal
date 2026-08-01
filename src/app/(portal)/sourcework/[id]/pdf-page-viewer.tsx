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
  onLoadError,
}: {
  fileUrl: string;
  pageNumber: number;
  scale: number;
  onLoadError?: (message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Document
      file={fileUrl}
      loading={<p className="p-4 text-sm text-ink-500">Loading page…</p>}
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
        <Page
          pageNumber={pageNumber}
          scale={scale}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={<p className="p-4 text-sm text-ink-500">Loading page…</p>}
        />
      )}
    </Document>
  );
}
