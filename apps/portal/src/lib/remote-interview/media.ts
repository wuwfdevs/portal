// Pure, dependency-free helpers for the remote-interview-media bucket:
// bucket name, object paths, and download filenames. No "server-only" —
// shared between capture.ts (browser-only) and server code (assembly.ts,
// storage.ts), and kept testable under Vitest without mocking Supabase, per
// CLAUDE.md's testing expectations. Mirrors lib/transcription/media.ts's
// shape for the same bucket-level concerns, one bucket over.

export const REMOTE_INTERVIEW_MEDIA_BUCKET = "remote-interview-media";

/** Where an assembled local-master file lives — one per participant per recording run. */
export function assembledTrackObjectPath(storagePrefix: string, runIndex: number): string {
  return `${storagePrefix}/assembled-local-run${runIndex}.wav`;
}

/** A readable download filename for a track, e.g. "Dr. Okafor - local - run 0.wav". */
export function trackDownloadFilename(params: {
  displayName: string;
  source: "local" | "cloud";
  runIndex: number;
  contentType: string | null;
}): string {
  const extension = params.contentType === "audio/ogg" ? "ogg" : "wav";
  const safeName = params.displayName.replace(/[\\/:*?"<>|]/g, "_").trim() || "participant";
  return `${safeName} - ${params.source} - run ${params.runIndex}.${extension}`;
}
