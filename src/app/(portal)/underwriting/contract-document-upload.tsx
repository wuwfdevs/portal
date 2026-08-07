"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint } from "@/components/ui/input";
import { completeContractDocumentUpload, getContractDocumentDownloadUrl } from "./contract-actions";

const CONTRACT_DOCUMENTS_BUCKET = "underwriting-documents";
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

function extensionFor(contentType: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  return "bin";
}

/**
 * The executed agreement/insertion order attachment (point 19 of the domain
 * redesign) — a real Storage object, not a bare URL field. Uploads direct
 * to the underwriting-documents bucket, then records the resulting path via
 * completeContractDocumentUpload(). upsert: true at a fixed per-contract
 * path, so a corrected re-upload replaces the document in place.
 */
export function ContractDocumentUpload({
  contractId,
  existingPath,
}: {
  contractId: string;
  existingPath: string | null;
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
    const storagePath = `${contractId}/agreement.${extensionFor(file.type)}`;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(CONTRACT_DOCUMENTS_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setStatus("idle");
      event.currentTarget.value = "";
      return;
    }

    const result = await completeContractDocumentUpload(contractId, storagePath);
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
    const result = await getContractDocumentDownloadUrl(contractId, existingPath);
    if (result.url) setDownloadUrl(result.url);
    if (result.error) setError(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      {existingPath && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={handleDownload}>
            Get download link
          </Button>
          {downloadUrl && (
            <a href={downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-link">
              Open document →
            </a>
          )}
        </div>
      )}
      <input
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        onChange={handleChange}
        disabled={status === "uploading"}
        className="text-xs text-ink-500"
      />
      <FieldHint>
        {existingPath ? "Replaces the current attached document." : "PDF, PNG, or JPEG of the executed agreement."}
      </FieldHint>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
