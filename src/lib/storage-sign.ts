import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * A short-lived signed URL for an object in a private bucket, through the
 * caller's own RLS-scoped client — so it only succeeds if their storage
 * policy lets them read the object. Generated per request and never cached.
 * Null when it could not be signed (the failure is logged); the caller
 * decides what that reads as. `download` makes the browser save the file
 * under that name instead of opening it.
 */
export async function signedUrl(
  bucket: string,
  path: string,
  options: { ttlSeconds: number; download?: string },
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(
      path,
      options.ttlSeconds,
      options.download ? { download: options.download } : undefined,
    );
  if (error || !data) {
    if (error) console.error(`Could not sign ${bucket}/${path}:`, error);
    return null;
  }
  return data.signedUrl;
}
