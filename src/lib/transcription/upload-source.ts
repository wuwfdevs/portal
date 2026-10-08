import { uploadWithProgress } from "@/lib/storage-upload";
import { probeDurationMs } from "@/lib/transcription/probe-duration";
import {
  TRANSCRIPTION_MEDIA_BUCKET,
  classifySourceFile,
  sourceObjectPath,
} from "@/lib/transcription/media";
import type { SwSourceKind } from "@/lib/database.types";

/**
 * The server half of an upload, supplied by the caller so the same sequence
 * serves a new project (which has just been created) and the add-source
 * dialog (which names an existing one): both bind their project id into these.
 */
export interface SourceUploadActions {
  createSource: (input: {
    title: string;
    kind: SwSourceKind;
  }) => Promise<{ sourceId: string } | { error: string }>;
  completeSource: (input: {
    sourceId: string;
    contentType: string;
    storagePath: string;
    sizeBytes: number;
    durationMs: number | null;
  }) => Promise<{ error?: string }>;
  failSource: (input: { sourceId: string; message: string }) => Promise<void>;
}

export type UploadSourceResult =
  | {
      ok: true;
      sourceId: string;
      /** The file is stored, but starting transcription/extraction failed; the project shows a Retry. */
      processingError?: string;
    }
  | {
      ok: false;
      /** Set once a source row exists, so a retry reuses it instead of creating a second. */
      sourceId: string | null;
      error: string;
      retryable: boolean;
    };

/**
 * Create the source, read its length, send the file (with progress), and
 * finish it so processing starts. One file, one source.
 *
 * `existingSourceId` is a retry after an interrupted upload: the row already
 * exists, so it is reused and the object is overwritten. A failure marks the
 * source failed only when it can't be retried or this was `finalAttempt`;
 * until then the source stays "uploading", so a retry doesn't flash red.
 *
 * A failure to *start processing* after the file is safely stored is not an
 * upload failure and doesn't mark the source failed: the representation
 * carries that error and its Retry clears it (see new-project-form's history
 * for the bug this avoids).
 */
export async function uploadSource(params: {
  file: File;
  title: string;
  actions: SourceUploadActions;
  existingSourceId?: string | null;
  finalAttempt?: boolean;
  onProgress?: (fraction: number) => void;
  onStage?: (stage: "creating" | "uploading" | "finishing") => void;
}): Promise<UploadSourceResult> {
  const { file, title, actions, existingSourceId = null, finalAttempt = true } = params;

  const classified = classifySourceFile(file.type);
  if ("error" in classified) {
    return { ok: false, sourceId: null, error: classified.error, retryable: false };
  }

  let sourceId = existingSourceId;
  if (!sourceId) {
    params.onStage?.("creating");
    const created = await actions.createSource({ title, kind: classified.kind });
    if ("error" in created) {
      return { ok: false, sourceId: null, error: created.error, retryable: false };
    }
    sourceId = created.sourceId;
  }

  params.onStage?.("uploading");
  const durationMs = classified.kind === "document" ? null : await probeDurationMs(file);
  const storagePath = sourceObjectPath(sourceId, file.type);
  const uploaded = await uploadWithProgress({
    bucket: TRANSCRIPTION_MEDIA_BUCKET,
    path: storagePath,
    file,
    upsert: existingSourceId !== null,
    onProgress: params.onProgress,
  });
  if (!uploaded.ok) {
    if (!uploaded.retryable || finalAttempt) {
      await actions.failSource({ sourceId, message: uploaded.error });
    }
    return { ok: false, sourceId, error: uploaded.error, retryable: uploaded.retryable };
  }

  params.onStage?.("finishing");
  const completed = await actions.completeSource({
    sourceId,
    contentType: file.type,
    storagePath,
    sizeBytes: file.size,
    durationMs,
  });
  return { ok: true, sourceId, processingError: completed.error };
}
