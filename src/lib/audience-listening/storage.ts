import "server-only";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(AUDIENCE_LISTENING_MEDIA_BUCKET)
    .createSignedUrl(
      storagePath,
      PLAYBACK_URL_TTL_SECONDS,
      downloadFilename ? { download: downloadFilename } : undefined,
    );

  if (error || !data) return null;
  return data.signedUrl;
}
