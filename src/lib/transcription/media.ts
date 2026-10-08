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

/**
 * The `accept` string and the sentence about it, for every source file picker and drop zone.
 * The extensions are there because browsers report an iPhone Voice Memo (.m4a) as
 * `audio/x-m4a`, `audio/m4a`, `audio/mp4a-latm`, or nothing at all, depending on the
 * browser and system; a name match catches what the type doesn't.
 */
export const SOURCE_FILE_ACCEPT =
  "audio/*,video/*,application/pdf,.m4a,.mp4,.m4v,.mov,.aac,.mp3,.wav,.webm,.pdf";
export const SOURCE_FILE_HINT = "WAV, MP3, M4A/AAC, MP4, MOV, WebM, or PDF.";

// Types browsers report for these formats that aren't the canonical ones the
// bucket and the allow-list know. Mapped, never stored.
const CONTENT_TYPE_ALIASES: Record<string, string> = {
  "audio/m4a": "audio/mp4",
  "audio/x-mp4": "audio/mp4",
  "audio/mp4a-latm": "audio/mp4",
  "audio/x-aac": "audio/aac",
  "audio/aacp": "audio/aac",
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "video/x-m4v": "video/mp4",
  "video/x-quicktime": "video/quicktime",
};

const CONTENT_TYPE_BY_FILE_EXTENSION: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
};

/**
 * The content type an upload of this file should carry: the browser's own when
 * the allow-list knows it, a known alias mapped to its canonical type, and
 * otherwise whatever the file name's extension says. Browsers disagree about
 * (or omit) the type of an iPhone's .m4a, so the extension is the fallback
 * rather than a refusal. Returns "" when nothing identifies the file.
 */
export function resolveSourceContentType(file: { name: string; type: string }): string {
  const reported = file.type.trim().toLowerCase().split(";")[0]!.trim();
  if (reported in EXTENSION_BY_CONTENT_TYPE) return reported;
  const alias = CONTENT_TYPE_ALIASES[reported];
  if (alias) return alias;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  return (extension && CONTENT_TYPE_BY_FILE_EXTENSION[extension]) || "";
}

/**
 * What kind of source a chosen file would be, or why it can't be one. The one
 * check every upload surface (new project, add source) runs before anything is
 * created, so a bad file is refused before a source row exists for it.
 */
export function classifySourceFile(file: {
  name: string;
  type: string;
}): { kind: "audio_video" | "document"; contentType: string } | { error: string } {
  const contentType = resolveSourceContentType(file);
  if (isDocumentContentType(contentType)) return { kind: "document", contentType };
  if (isAllowedMediaType(contentType)) return { kind: "audio_video", contentType };
  return { error: `That file type isn't supported. Use ${SOURCE_FILE_HINT}` };
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

/**
 * A source's default title, taken from the uploaded file's own name: the
 * extension dropped, underscores read as spaces, whitespace collapsed.
 *
 * Deliberately light-handed — this is a suggestion the reporter can overwrite,
 * not a normalization, so a filename that already reads like a title
 * ("Reeves interview, 3-14.wav") survives intact. Returns "" for a name with
 * nothing left after the extension, which leaves the field empty rather than
 * prefilling something meaningless.
 */
export function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  return withoutExtension.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

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

import { formatClockMs } from "@/lib/format";
export { formatBytes } from "@/lib/format";

/** mm:ss for under an hour, h:mm:ss beyond that. */
export function formatDuration(durationMs: number): string {
  return formatClockMs(durationMs);
}
