import { describeUploadRefusal } from "@/lib/storage-upload-errors";

/** The slice of a Supabase client an upload needs (the browser client satisfies it). */
export interface StorageClientLike {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Blob | ArrayBuffer | ArrayBufferView,
        options: { contentType?: string; upsert?: boolean },
      ): Promise<{ error: (Error & { status?: number; statusCode?: string | number }) | null }>;
      remove(paths: string[]): Promise<unknown>;
    };
  };
}

export type UploadObjectResult = { ok: true } | { ok: false; message: string };

function sizeOf(body: Blob | ArrayBuffer | ArrayBufferView): number {
  if (body instanceof Blob) return body.size;
  return body.byteLength;
}

/**
 * Upload one object straight from the browser to Storage. Never throws: a
 * refusal (too large, not permitted) and a thrown network failure both come
 * back as `{ ok: false, message }`, with a size refusal explained in terms a
 * reporter can act on (`describeUploadRefusal`). `cleanup` removes the object
 * best-effort when the upload threw part-way, so a half-sent file isn't left
 * behind; a plain refusal stored nothing, so there is nothing to remove.
 */
export async function uploadObject({
  client,
  bucket,
  path,
  body,
  contentType,
  upsert = false,
  cleanup = false,
}: {
  client: StorageClientLike;
  bucket: string;
  path: string;
  body: Blob | ArrayBuffer | ArrayBufferView;
  contentType?: string;
  upsert?: boolean;
  cleanup?: boolean;
}): Promise<UploadObjectResult> {
  try {
    const { error } = await client.storage.from(bucket).upload(path, body, { contentType, upsert });
    if (!error) return { ok: true };
    const status = Number(error.status ?? error.statusCode ?? 0) || 0;
    return {
      ok: false,
      message: describeUploadRefusal({
        status,
        apiMessage: error.message,
        fileSizeBytes: sizeOf(body),
      }).message,
    };
  } catch {
    if (cleanup) await removeUploadedObject(client, bucket, path);
    return {
      ok: false,
      message: "The upload didn't go through — check your connection and try again.",
    };
  }
}

/** Remove an object nothing points at any more; best effort, never throws. */
export async function removeUploadedObject(
  client: StorageClientLike,
  bucket: string,
  path: string,
): Promise<void> {
  try {
    await client.storage.from(bucket).remove([path]);
  } catch {
    // An orphaned object is harmless next to losing the original error.
  }
}
