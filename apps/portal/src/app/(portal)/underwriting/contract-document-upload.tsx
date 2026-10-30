"use client";

import { RecordDocumentUpload } from "@/components/ui/record-document-upload";
import { completeContractDocumentUpload, getContractDocumentDownloadUrl } from "./contract-actions";

const CONTRACT_DOCUMENTS_BUCKET = "underwriting-documents";

/**
 * The executed agreement/insertion order attachment (point 19 of the domain
 * redesign) — a real Storage object, not a bare URL field. Uploads direct
 * to the underwriting-documents bucket, then records the resulting path via
 * completeContractDocumentUpload(). Fixed per-contract path, so a corrected
 * re-upload replaces the document in place (see RecordDocumentUpload).
 */
export function ContractDocumentUpload({
  contractId,
  existingPath,
}: {
  contractId: string;
  existingPath: string | null;
}) {
  return (
    <RecordDocumentUpload
      bucket={CONTRACT_DOCUMENTS_BUCKET}
      basePath={`${contractId}/agreement`}
      existingPath={existingPath}
      complete={(storagePath) => completeContractDocumentUpload(contractId, storagePath)}
      download={(storagePath) => getContractDocumentDownloadUrl(contractId, storagePath)}
      openLabel="Open document →"
      addHint="PDF, PNG, or JPEG of the executed agreement."
      replaceHint="Replaces the current attached document."
    />
  );
}
