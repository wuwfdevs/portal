// Pure, dependency-free helpers for source media: the upload allow-list,
// storage paths, and display formatting. No "server-only" here — this is
// shared between the client-side upload form and server code, and kept
// testable under Vitest without mocking Supabase, per CLAUDE.md's testing
// expectations.

export const TRANSCRIPTION_MEDIA_BUCKET = "transcription-media";

// Browser-playable formats only (see docs/transcription-workspace-design.md
// §6): this is what lets Phase 1 skip a transcode pipeline entirely — the
// same file that gets uploaded is played back natively and, later, ingested
// directly by the ASR provider. Keep this in sync with the bucket's
// allowed_mime_types in the schema migration.
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/webm": "webm",
};

export function isAllowedMediaType(contentType: string): boolean {
  return contentType in EXTENSION_BY_CONTENT_TYPE;
}

export function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
}

export function isVideoContentType(contentType: string): boolean {
  return contentType.startsWith("video/");
}

/** Every source file lives at `<project id>/source.<ext>` — one file per project. */
export function sourceObjectPath(projectId: string, contentType: string): string {
  return `${projectId}/source.${extensionForContentType(contentType)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/** mm:ss for under an hour, h:mm:ss beyond that. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
