"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, FileInput } from "@/components/ui/input";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_TYPE_ERROR,
  documentExtensionFor,
  isAllowedDocumentUploadType,
} from "@/lib/document-upload";

type ActionResult = { error?: string | null };

/**
 * One document attached to a record (an executed agreement, a signed
 * insertion order): the file goes browser-direct to a private Storage bucket
 * at a fixed path per record (`upsert`, so a corrected upload replaces the
 * old one in place), then the path is recorded through a Server Action, and
 * members read it through a short-lived signed URL. Traffic's contract
 * agreement and Bookings' signed agreement were the same 110 lines apart from
 * the bucket, the path and the two actions; this is that shape once.
 */
export function RecordDocumentUpload({
  bucket,
  basePath,
  existingPath,
  complete,
  download,
  canUpload = true,
  openLabel,
  emptyText,
  addHint,
  replaceHint,
}: {
  bucket: string;
  /** The object path without its extension, e.g. `${contractId}/agreement`. */
  basePath: string;
  existingPath: string | null;
  /** Records the stored path on the record; returns `{ error }` on failure. */
  complete: (storagePath: string) => Promise<ActionResult>;
  /** A short-lived signed URL for the stored document. */
  download: (storagePath: string) => Promise<{ url?: string | null; error?: string | null }>;
  /** False hides the file input (a member who may read but not replace). */
  canUpload?: boolean;
  /** The link shown once a download URL is ready, e.g. "Open the signed agreement →". */
  openLabel: string;
  /** Shown when nothing is attached; omit to show nothing. */
  emptyText?: string;
  addHint: string;
  replaceHint: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);

    if (!isAllowedDocumentUploadType(file.type)) {
      setError(DOCUMENT_UPLOAD_TYPE_ERROR);
      input.value = "";
      return;
    }

    setStatus("uploading");
    const storagePath = `${basePath}.${documentExtensionFor(file.type)}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setStatus("idle");
      input.value = "";
      return;
    }

    const result = await complete(storagePath);
    setStatus("idle");
    input.value = "";
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDownload() {
    if (!existingPath) return;
    const result = await download(existingPath);
    if (result.url) setDownloadUrl(result.url);
    if (result.error) setError(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      {existingPath ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={handleDownload}>
            Get download link
          </Button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-brand-link"
            >
              {openLabel}
            </a>
          )}
        </div>
      ) : (
        emptyText && <p className="text-xs text-ink-500">{emptyText}</p>
      )}
      {canUpload && (
        <>
          <FileInput
            accept={DOCUMENT_UPLOAD_ACCEPT}
            onChange={handleChange}
            disabled={status === "uploading"}
          />
          <FieldHint>{existingPath ? replaceHint : addHint}</FieldHint>
        </>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
