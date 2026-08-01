import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  isAllowedDocumentType,
  isAllowedMediaType,
  isDocumentContentType,
} from "@/lib/transcription/media";
import { startTranscriptionForProject } from "@/lib/transcription/ingest";
import { startDocumentProcessing } from "@/lib/transcription/document-ingest";

/**
 * Shared second half of finishing a source's upload — content-type
 * validation, marking the source ready, and dispatching to OCR or ASR.
 * Extracted so completeProjectUpload (new project) and completeSourceUpload
 * (uploading a new source into an existing project) can't drift on
 * validation or dispatch logic. Lives in its own file rather than inside
 * ingest.ts: document-ingest.ts already imports redactUrls from ingest.ts,
 * so ingest.ts importing startDocumentProcessing back from document-ingest.ts
 * would be a circular import.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

export interface FinalizeSourceUploadInput {
  sourceId: string;
  representationId: string;
  contentType: string;
  storagePath: string;
  sizeBytes: number;
  durationMs: number | null;
}

export async function finalizeSourceUpload(
  supabase: Client,
  input: FinalizeSourceUploadInput,
): Promise<{ error?: string }> {
  const isDocument = isDocumentContentType(input.contentType);
  if (!isDocument && !isAllowedMediaType(input.contentType)) {
    return { error: "That file type isn't supported." };
  }
  if (isDocument && !isAllowedDocumentType(input.contentType)) {
    return { error: "That file type isn't supported." };
  }

  const { error } = await supabase
    .from("sw_sources")
    .update({
      original_storage_path: input.storagePath,
      original_content_type: input.contentType,
      original_size_bytes: input.sizeBytes,
      original_duration_ms: isDocument ? null : input.durationMs,
      status: "ready",
      error_message: null,
    })
    .eq("id", input.sourceId);

  if (error) {
    return { error: "The upload finished, but we couldn't save the source. Please try again." };
  }

  if (isDocument) {
    return startDocumentProcessing(supabase, {
      representationId: input.representationId,
      sourceId: input.sourceId,
      storagePath: input.storagePath,
    });
  }

  return startTranscriptionForProject(supabase, {
    representationId: input.representationId,
    storagePath: input.storagePath,
  });
}
