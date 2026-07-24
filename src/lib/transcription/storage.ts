import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TRANSCRIPTION_MEDIA_BUCKET } from "@/lib/transcription/media";

const PLAYBACK_URL_TTL_SECONDS = 60 * 30; // 30 minutes — reload the page to refresh.
const INGEST_URL_TTL_SECONDS = 60 * 60 * 6; // 6 hours — long enough for the ASR provider to fetch a large file.

/**
 * A short-lived signed URL for playing back a project's source media.
 * Uses the RLS-scoped server client, so this only succeeds if the current
 * user actually has a storage select policy allowing it — never a
 * privilege-escalation path. Returns null if the object can't be reached
 * (missing, or access denied).
 */
export async function getSignedMediaUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .createSignedUrl(storagePath, PLAYBACK_URL_TTL_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * A longer-lived signed URL handed to the ASR provider so it can fetch the
 * source file itself — called once, right after upload, from the
 * still-authenticated uploader's own request (see completeProjectUpload).
 */
export async function getSignedMediaUrlForIngest(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .createSignedUrl(storagePath, INGEST_URL_TTL_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}
