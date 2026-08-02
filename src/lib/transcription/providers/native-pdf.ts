import "server-only";
// Native PDF text extraction via pdfjs-dist's Node-compatible legacy build —
// no rendering, no canvas, just the embedded text layer + page geometry.
// See docs/sourcework-design.md §8.6. Not a vendor "provider" in the API-key
// sense, but structurally the same swappable-adapter role as
// providers/mistral-ocr.ts and providers/assemblyai.ts.

import {
  buildNativeBlocksForPage,
  isNativeTextAdequate,
  type NativeTextItem,
  type NativeTextPage,
} from "@/lib/transcription/document-normalization";
import type { NormalizedDocumentResult } from "@/lib/transcription/document-provider";

export interface NativeExtractionResult extends NormalizedDocumentResult {
  /** Whether the extracted text is adequate to use as-is (isNativeTextAdequate) — the pipeline's native-vs-OCR decision. */
  adequate: boolean;
}

/**
 * Makes pdf.mjs importable on a server with no DOM and no canvas.
 *
 * pdf.mjs evaluates `new DOMMatrix()` at module scope (a constant belonging
 * to its canvas renderer), and under Node it expects to have polyfilled that
 * global from `@napi-rs/canvas` — an *optional* dependency of pdfjs-dist. On
 * Vercel that package isn't resolvable from the bundled server output, so the
 * polyfill silently warns, the module-scope constant throws, and every PDF
 * upload failed at processing time with "DOMMatrix is not defined".
 *
 * Defining the global first makes pdfjs skip its own polyfill. Nothing here
 * ever renders a page — this module calls `getViewport()` and
 * `getTextContent()` and nothing else — so the stub is only ever constructed,
 * never used, and pulling tens of megabytes of native canvas into the
 * deployment to satisfy one unread constant would buy nothing.
 */
function ensureCanvaslessGlobals(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (globals.DOMMatrix === undefined) {
    globals.DOMMatrix = class DOMMatrix {};
  }
}

/**
 * Makes pdf.mjs able to find its own worker on a server where it isn't
 * sitting next to `pdf.worker.mjs` on disk.
 *
 * Under Node, pdf.mjs runs a "fake worker" (parsing in-process, no real
 * Worker thread) rather than fail outright, but it still needs the worker
 * module's exports to do it — so on first use it evaluates `import("./pdf.worker.mjs")`,
 * a *relative* specifier resolved against pdf.mjs's own location. That's a
 * runtime string, not a literal a bundler can trace, so Next's server bundle
 * doesn't carry pdf.worker.mjs to wherever pdf.mjs ends up as a chunk on
 * Vercel, and the relative import 404s with "Cannot find module
 * '.../pdf.worker.mjs' imported from '.../pdf.mjs'".
 *
 * pdf.mjs checks `globalThis.pdfjsWorker?.WorkerMessageHandler` first and
 * skips the broken import entirely if it's already set (confirmed by reading
 * PDFWorker's #initialize/#mainThreadWorkerMessageHandler in the installed
 * package) — this is exactly that hook. Our import here uses a literal
 * specifier, which Next's tracer does follow and bundle correctly, same as
 * the pdf.mjs import below it.
 */
async function ensurePdfWorkerGlobal(): Promise<void> {
  const globals = globalThis as unknown as { pdfjsWorker?: unknown };
  if (globals.pdfjsWorker === undefined) {
    // pdfjs-dist ships no declaration file for this entry point (only the
    // main pdf.mjs one has a .d.mts) — imported purely for the
    // WorkerMessageHandler side effect below. Kept as a literal specifier
    // (not hoisted into a variable) so bundlers can trace and include it —
    // that's the entire fix; see this function's doc comment above.
    // @ts-expect-error — pdfjs-dist ships no types for this entry point.
    globals.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }
}

/**
 * Extracts every page's text + geometry from a PDF's own embedded text
 * layer. Purely local — no network call, no external provider — so the
 * document-processing pipeline runs this synchronously before deciding
 * whether OCR is needed at all (see document-ingest.ts).
 */
export async function extractNativeDocumentText(pdfBytes: Uint8Array): Promise<NativeExtractionResult> {
  ensureCanvaslessGlobals();
  await ensurePdfWorkerGlobal();
  // Dynamic import: pdfjs-dist's legacy build is ESM-only and pulls in a
  // meaningful chunk of parsing code that only the document pipeline needs —
  // no reason to load it into every server bundle that imports this module's
  // sibling files.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  try {
    const pages: NativeTextPage[] = [];
    const rotationByPage = new Map<number, number>();
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // pdfjs reports a page's own rotation (its /Rotate attribute) on the
      // Page object itself, not the viewport.
      rotationByPage.set(pageNumber, page.rotate);

      const items: NativeTextItem[] = [];
      for (const raw of content.items) {
        // pdfjs's TextItem type also includes a TextMarkedContent variant
        // with no `str` — skip those defensively rather than assume the cast.
        if (!("str" in raw) || typeof raw.str !== "string") continue;
        const transform = raw.transform as number[];
        items.push({
          str: raw.str,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          width: raw.width ?? 0,
          height: raw.height ?? Math.abs(transform[0] ?? 0),
          fontSize: Math.abs(transform[0] ?? raw.height ?? 0),
          hasEOL: Boolean(raw.hasEOL),
        });
      }

      pages.push({
        pageNumber,
        widthPt: viewport.width,
        heightPt: viewport.height,
        items,
      });
    }

    const adequate = isNativeTextAdequate(
      pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.items.map((item) => item.str).join(" "),
      })),
    );

    let readingOrder = 0;
    const blocks = pages.flatMap((page) => {
      const pageBlocks = buildNativeBlocksForPage(page, readingOrder);
      readingOrder += pageBlocks.length;
      return pageBlocks;
    });

    return {
      adequate,
      pages: pages.map((page) => ({
        pageNumber: page.pageNumber,
        widthPt: page.widthPt,
        heightPt: page.heightPt,
        rotationDegrees: rotationByPage.get(page.pageNumber) ?? 0,
      })),
      blocks,
    };
  } finally {
    await loadingTask.destroy();
  }
}
