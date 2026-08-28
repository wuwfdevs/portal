import "server-only";
// PDF half of the program-log import's text-extraction step (see
// program-log-docx-text.ts for the Word half). Reuses Sourcework's existing
// native-PDF text extraction (lib/transcription/providers/native-pdf.ts,
// via pdfjs-dist's embedded text layer — no rendering) rather than building
// a second way of reading a PDF in this codebase.
//
// Deliberately native-text-only, no Mistral OCR fallback: a DAD/traffic-
// system export is a born-digital printout, not a scan, so a missing text
// layer here means something is actually wrong with the file, not a normal
// case to silently work around. Sourcework's OCR fallback also needs the
// file already sitting in Storage at a signed URL Mistral can fetch — this
// importer never uploads anything (it's a preview-before-confirm screen;
// nothing is written until the plan is confirmed), and standing up a
// Storage round trip solely to maybe OCR a station traffic-log printout
// isn't worth it for a case that shouldn't occur. If a real scanned export
// ever shows up, that's the point to reconsider.

import { extractNativeDocumentText } from "@/lib/transcription/providers/native-pdf";

export type PdfTextResult = { ok: true; text: string } | { ok: false; error: string };

export async function extractPdfPlainText(pdfBytes: Uint8Array): Promise<PdfTextResult> {
  let extraction;
  try {
    extraction = await extractNativeDocumentText(pdfBytes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not read this PDF." };
  }

  if (!extraction.adequate) {
    return {
      ok: false,
      error:
        "This PDF doesn't have a readable text layer (it looks like a scanned image) — this importer only reads a native digital export. Try the Word (.docx) export instead.",
    };
  }

  const text = [...extraction.blocks]
    .sort((a, b) => a.pageNumber - b.pageNumber || a.readingOrder - b.readingOrder)
    .map((block) => block.text)
    .filter((blockText) => blockText.trim() !== "")
    .join("\n");

  if (text.trim() === "") {
    return { ok: false, error: "No readable text was found in this PDF." };
  }

  return { ok: true, text };
}
