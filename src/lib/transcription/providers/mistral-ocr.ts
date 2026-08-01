import "server-only";
// Mistral OCR provider adapter — the fallback path when a PDF's own embedded
// text isn't adequate (see providers/native-pdf.ts and document-ingest.ts).
// Behind the official @mistralai/mistralai SDK, never a hand-rolled HTTP
// call, per this repo's stated preference for an official SDK over
// reimplementing a provider's wire format. See docs/sourcework-design.md §8.6
// for the docs-verification note (docs.mistral.ai returns 403 to automated
// fetches here — this adapter's request/response shape is verified against
// the installed SDK's own TypeScript types instead) and the mapping's own
// module (mistral-ocr-mapping.ts) for how the response becomes Sourcework's
// normalized document model.

import { Mistral } from "@mistralai/mistralai";
import type { DocumentOcrInput, DocumentOcrProvider, DocumentOcrResult } from "@/lib/transcription/document-provider";
import { mapMistralResponseToDocument } from "./mistral-ocr-mapping";

const MODEL = "mistral-ocr-latest";

export const mistralOcrProvider: DocumentOcrProvider = {
  async process(input: DocumentOcrInput): Promise<DocumentOcrResult> {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("Document OCR isn't configured yet (missing MISTRAL_API_KEY).");
    }

    const client = new Mistral({ apiKey });
    const response = await client.ocr.process({
      model: MODEL,
      document: { type: "document_url", documentUrl: input.documentUrl },
      // Block-level bounding boxes are the whole point — see design doc §8.4's
      // provenance invariant.
      includeBlocks: true,
      // Page-level confidence, applied to every block on that page
      // (mistral-ocr-mapping.ts) — word-level scores would need a
      // markdown-offset-to-block mapping this phase doesn't build (see
      // design doc §8.6).
      confidenceScoresGranularity: "page",
      tableFormat: "html",
      includeImageBase64: false, // the original PDF is already in Storage.
    });

    const normalized = mapMistralResponseToDocument(response);
    return {
      ...normalized,
      provider: "mistral",
      model: response.model,
      raw: response,
    };
  },
};
