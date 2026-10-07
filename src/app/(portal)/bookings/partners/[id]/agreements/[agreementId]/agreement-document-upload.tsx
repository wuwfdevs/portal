"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, FileInput } from "@/components/ui/input";
import { completeAgreementDocumentUpload, getAgreementDocumentDownloadUrl } from "../../../actions";

const DOCUMENTS_BUCKET = "bookings-documents";
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

function extensionFor(contentType: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  return "bin";
}

/**
 * The signed agreement (docs/bookings-design.md §5: `document_path`) — the
 * Traffic contract document's shape exactly: browser-direct to the private
 * bookings-documents bucket, upsert at a fixed per-agreement path so a
 * corrected upload replaces the document, then the path recorded through a
 * Server Action. Members read it through a short-lived signed URL.
 */
export function AgreementDocumentUpload({
  agreementId,
  existingPath,
  canUpload,
}: {
  agreementId: string;
  existingPath: string | null;
  canUpload: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("That file type isn't supported. Use PDF, PNG, or JPEG.");
      event.currentTarget.value = "";
      return;
    }
    setStatus("uploading");
    const storagePath = `${agreementId}/agreement.${extensionFor(file.type)}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setStatus("idle");
      event.currentTarget.value = "";
      return;
    }
    const result = await completeAgreementDocumentUpload(agreementId, storagePath);
    setStatus("idle");
    event.currentTarget.value = "";
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDownload() {
    if (!existingPath) return;
    const result = await getAgreementDocumentDownloadUrl(agreementId, existingPath);
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
              Open the signed agreement →
            </a>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-500">No signed agreement attached.</p>
      )}
      {canUpload && (
        <>
          <FileInput
            accept="application/pdf,image/png,image/jpeg"
            onChange={handleChange}
            disabled={status === "uploading"}
          />
          <FieldHint>
            {existingPath
              ? "Replaces the attached document."
              : "PDF, PNG, or JPEG of the signed agreement."}
          </FieldHint>
        </>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
