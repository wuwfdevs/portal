import "server-only";
import { signedUrl } from "@/lib/storage-sign";
import { AUDIENCE_LISTENING_MEDIA_BUCKET } from "@/lib/audience-listening/media";

// Same shape as lib/transcription/storage.ts and lib/remote-interview/storage.ts,
// one bucket over: a short-lived signed URL generated per request, never
// cached, always through the RLS-scoped server client — so it only succeeds if
// the caller's own storage policy allows it. The bucket is private and there is
// no public URL for participant audio anywhere in this tool.

const PLAYBACK_URL_TTL_SECONDS = 60 * 30; // 30 minutes — reload the page to refresh.

export async function getSignedAnswerUrl(
  storagePath: string,
  downloadFilename?: string,
): Promise<string | null> {
  return signedUrl(AUDIENCE_LISTENING_MEDIA_BUCKET, storagePath, {
    ttlSeconds: PLAYBACK_URL_TTL_SECONDS,
    download: downloadFilename,
  });
}
