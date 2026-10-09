import "server-only";
import { signedUrl } from "@/lib/storage-sign";
import { TRANSCRIPTION_MEDIA_BUCKET } from "@/lib/transcription/media";

const PLAYBACK_URL_TTL_SECONDS = 60 * 30; // 30 minutes — reload the page to refresh.
const INGEST_URL_TTL_SECONDS = 60 * 60 * 6; // 6 hours — long enough for the ASR provider to fetch a large file.

/**
 * A short-lived signed URL for playing back a project's source media, or
 * downloading a clip export. Uses the RLS-scoped server client, so this
 * only succeeds if the current user actually has a storage select policy
 * allowing it — never a privilege-escalation path. Returns null if the
 * object can't be reached (missing, or access denied).
 *
 * `downloadFilename`, when given, sets the URL's Content-Disposition so a
 * browser save picks that name instead of the raw storage object key (a
 * UUID) — used for clip exports, which want a predictable, readable
 * filename (see docs/transcription-workspace-design.md §5 on export
 * filenames).
 */
export async function getSignedMediaUrl(
  storagePath: string,
  downloadFilename?: string,
): Promise<string | null> {
  return signedUrl(TRANSCRIPTION_MEDIA_BUCKET, storagePath, {
    ttlSeconds: PLAYBACK_URL_TTL_SECONDS,
    download: downloadFilename,
  });
}

/**
 * A longer-lived signed URL handed to the ASR provider so it can fetch the
 * source file itself — called once, right after upload, from the
 * still-authenticated uploader's own request (see completeSourceUpload).
 */
export async function getSignedMediaUrlForIngest(storagePath: string): Promise<string | null> {
  return signedUrl(TRANSCRIPTION_MEDIA_BUCKET, storagePath, { ttlSeconds: INGEST_URL_TTL_SECONDS });
}
