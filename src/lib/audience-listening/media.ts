// Pure, dependency-free helpers for participant audio: the upload allow-list,
// recording format selection, object paths, and the limits. No "server-only" —
// this is shared between the public recorder (browser) and server code, and
// kept testable under Vitest without mocking Supabase, per CLAUDE.md's testing
// expectations. Mirrors lib/transcription/media.ts's shape, one bucket over.

export const AUDIENCE_LISTENING_MEDIA_BUCKET = "audience-listening-media";

/** Matches the bucket's file_size_limit and al_complete_answer()'s check. */
export const MAX_ANSWER_BYTES = 50 * 1024 * 1024;

export const DEFAULT_MAX_DURATION_SECONDS = 120;
export const MIN_MAX_DURATION_SECONDS = 15;
export const MAX_MAX_DURATION_SECONDS = 600;

// Keep in sync with the bucket's allowed_mime_types and the allow-list inside
// al_reserve_answer(). Bare types only: a MediaRecorder MIME string carries
// codec parameters ("audio/webm;codecs=opus") and Storage matches these
// exactly, so everything is normalized before it goes anywhere.
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/**
 * Recording containers to try, best first. Browsers genuinely differ here and
 * assuming one works everywhere is how a flow like this silently fails on
 * Safari: Chrome and Firefox give WebM/Opus, Safari gives MP4/AAC, and some
 * Firefox builds fall back to Ogg/Opus. Probed with
 * MediaRecorder.isTypeSupported() at record time.
 */
export const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

/** "audio/webm;codecs=opus" -> "audio/webm". */
export function normalizeContentType(contentType: string): string {
  return (contentType.split(";")[0] ?? "").trim().toLowerCase();
}

export function isAllowedAnswerType(contentType: string): boolean {
  return normalizeContentType(contentType) in EXTENSION_BY_CONTENT_TYPE;
}

export function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[normalizeContentType(contentType)] ?? "bin";
}

/**
 * Where an answer's audio lives. Deliberately extension-less — see the
 * al_answers.storage_path comment in the migration: a redo on a browser that
 * picks a different container would otherwise orphan the first upload under a
 * different key. This mirrors what al_reserve_answer() builds server-side; the
 * server's value is the authoritative one and the client always uses what it
 * was handed back.
 */
export function answerObjectPath(queryId: string, submissionId: string, answerId: string): string {
  return `${queryId}/${submissionId}/${answerId}`;
}

/**
 * A readable filename for a staff download or the transcription handoff, e.g.
 * "q2-maria-lopez.webm". Falls back to the position alone when the participant
 * can't be named — which is the common case, since the name is withheld unless
 * they gave permission to be identified.
 */
export function answerDownloadFilename(params: {
  questionPosition: number;
  participantLabel: string | null;
  contentType: string;
}): string {
  const suffix = params.participantLabel
    ? `-${params.participantLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)}`
    : "";
  return `q${params.questionPosition}${suffix}.${extensionForContentType(params.contentType)}`;
}

/** m:ss, for a recording timer and short answer durations. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "2 minutes", "45 seconds" — for prose, where m:ss reads as a stopwatch. */
export function describeDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} seconds`;
  const minutes = totalSeconds / 60;
  const rounded = Number.isInteger(minutes) ? minutes : Math.round(minutes * 10) / 10;
  return `${rounded} minute${rounded === 1 ? "" : "s"}`;
}
