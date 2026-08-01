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
const AUDIO_VIDEO_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
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

// Document sources (docs/sourcework-design.md §8.2) — PDF only for now.
// Keep in sync with the bucket's allowed_mime_types
// (20260731180000_sourcework_documents.sql).
const DOCUMENT_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
};

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  ...AUDIO_VIDEO_EXTENSION_BY_CONTENT_TYPE,
  ...DOCUMENT_EXTENSION_BY_CONTENT_TYPE,
};

export function isAllowedMediaType(contentType: string): boolean {
  return contentType in AUDIO_VIDEO_EXTENSION_BY_CONTENT_TYPE;
}

export function isAllowedDocumentType(contentType: string): boolean {
  return contentType in DOCUMENT_EXTENSION_BY_CONTENT_TYPE;
}

export function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
}

export function isVideoContentType(contentType: string): boolean {
  return contentType.startsWith("video/");
}

export function isDocumentContentType(contentType: string): boolean {
  return contentType in DOCUMENT_EXTENSION_BY_CONTENT_TYPE;
}

/** Every source file lives at `<source id>/source.<ext>` — one file per source. */
export function sourceObjectPath(sourceId: string, contentType: string): string {
  return `${sourceId}/source.${extensionForContentType(contentType)}`;
}

/** Every excerpt export lives at `<source id>/excerpts/<excerpt id>.wav`. */
export function excerptExportObjectPath(sourceId: string, excerptId: string): string {
  return `${sourceId}/excerpts/${excerptId}.wav`;
}

// A clip is an excerpt, not a re-upload of the whole interview — this bounds
// both the export's memory footprint (the rendered WAV is buffered in full
// before upload) and guards against a selection mistake spanning nearly the
// entire recording.
export const MAX_CLIP_DURATION_MS = 20 * 60 * 1000;

// "Export all clips" renders and archives every clip in one request, so the
// same memory argument applies to the project as a whole: one clip's WAV is
// held at a time while the zip streams out, but a project with an
// unreasonable amount of audio in it should be told to export clip by clip
// rather than tie up a request for minutes of ffmpeg work.
export const MAX_CLIPS_ZIP_DURATION_MS = 60 * 60 * 1000;

/** Lowercase, hyphenated, filesystem-safe. Falls back to "untitled" for a string with no alphanumeric characters. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "untitled";
}

/** Predictable export filename, e.g. "2026-07-22_reeves-interview_bridge-funding.wav". */
export function buildClipExportFilename(
  dateIso: string,
  projectTitle: string,
  clipTitle: string,
): string {
  const date = dateIso.slice(0, 10);
  return `${date}_${slugify(projectTitle)}_${slugify(clipTitle)}.wav`;
}

/** Same shape as a clip export, for the whole project's transcript, e.g. "2026-07-22_reeves-interview_transcript.txt". */
export function buildTranscriptExportFilename(dateIso: string, projectTitle: string): string {
  return `${dateIso.slice(0, 10)}_${slugify(projectTitle)}_transcript.txt`;
}

/** Same shape again, for the archive of every clip in a project. */
export function buildClipsZipFilename(dateIso: string, projectTitle: string): string {
  return `${dateIso.slice(0, 10)}_${slugify(projectTitle)}_clips.zip`;
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
