import { createClient } from "@/lib/supabase/client";

/** The object URL storage-js posts a new file to, with each path segment encoded. */
export function storageObjectUploadUrl(baseUrl: string, bucket: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`;
}

export type StorageUploadResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** A dropped connection or a server hiccup, worth trying again. */ retryable: boolean;
    };

/**
 * Uploads one file to a Storage bucket straight from the browser, reporting
 * progress as bytes leave. supabase-js's own `upload()` is a single `fetch`,
 * which can't report progress, and a long recording on a slow connection
 * with no movement on screen looks the same as a hang. This posts the same
 * request storage-js does (a multipart body, the signed-in user's token, the
 * publishable key, `x-upsert`), so Storage's RLS policies apply exactly as
 * before. Not resumable: a failed upload starts over.
 */
export async function uploadWithProgress(params: {
  bucket: string;
  path: string;
  file: File;
  upsert?: boolean;
  onProgress?: (fraction: number) => void;
}): Promise<StorageUploadResult> {
  const { bucket, path, file, upsert = false, onProgress } = params;

  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return {
      ok: false,
      error: "Your session has expired. Reload the page and sign in again.",
      retryable: false,
    };
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", storageObjectUploadUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, bucket, path));
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    xhr.setRequestHeader("x-upsert", String(upsert));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve({ ok: true });
        return;
      }
      let message = `The upload was refused (HTTP ${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = body.message ?? body.error ?? message;
      } catch {
        // keep the generic message
      }
      resolve({ ok: false, error: message, retryable: xhr.status >= 500 || xhr.status === 429 });
    };
    xhr.onerror = () =>
      resolve({ ok: false, error: "The connection dropped during the upload.", retryable: true });
    xhr.ontimeout = () => resolve({ ok: false, error: "The upload timed out.", retryable: true });

    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}
