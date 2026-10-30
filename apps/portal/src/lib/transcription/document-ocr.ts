import "server-only";
import type { DocumentOcrProvider } from "@/lib/transcription/document-provider";
import { mistralOcrProvider } from "@/lib/transcription/providers/mistral-ocr";

/** Single swap point for the document OCR provider — mirrors asr.ts's role for the transcription provider. */
export function getDocumentOcrProvider(): DocumentOcrProvider {
  return mistralOcrProvider;
}
