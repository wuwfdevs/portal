import "server-only";
import { createClient } from "@/lib/supabase/server";
import { REMOTE_INTERVIEW_MEDIA_BUCKET } from "@/lib/remote-interview/media";

// A signed URL is short-lived and generated per request rather than cached
// anywhere, matching lib/transcription/storage.ts's getSignedMediaUrl — the
// same pattern, one bucket over. Uses the RLS-scoped server client, so this
// only succeeds if the current user's own storage policy allows it.

const DOWNLOAD_URL_TTL_SECONDS = 60 * 30; // 30 minutes — reload the page to refresh.

/**
 * A short-lived signed URL for downloading an assembled track. Returns null
 * if the object can't be reached (missing, or access denied by RLS).
 */
export async function getSignedTrackUrl(
  storagePath: string,
  downloadFilename: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(REMOTE_INTERVIEW_MEDIA_BUCKET)
    .createSignedUrl(storagePath, DOWNLOAD_URL_TTL_SECONDS, { download: downloadFilename });

  if (error || !data) return null;
  return data.signedUrl;
}
