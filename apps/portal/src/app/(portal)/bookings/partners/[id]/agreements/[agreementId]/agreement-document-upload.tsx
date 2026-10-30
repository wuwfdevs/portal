"use client";

import { RecordDocumentUpload } from "@/components/ui/record-document-upload";
import { completeAgreementDocumentUpload, getAgreementDocumentDownloadUrl } from "../../../actions";

const DOCUMENTS_BUCKET = "bookings-documents";

/**
 * The signed agreement (docs/bookings-design.md §5: `document_path`) — the
 * Traffic contract document's shape exactly (see RecordDocumentUpload):
 * browser-direct to the private bookings-documents bucket, fixed per-agreement
 * path so a corrected upload replaces the document, then the path recorded
 * through a Server Action. Members read it through a short-lived signed URL.
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
  return (
    <RecordDocumentUpload
      bucket={DOCUMENTS_BUCKET}
      basePath={`${agreementId}/agreement`}
      existingPath={existingPath}
      canUpload={canUpload}
      complete={(storagePath) => completeAgreementDocumentUpload(agreementId, storagePath)}
      download={(storagePath) => getAgreementDocumentDownloadUrl(agreementId, storagePath)}
      openLabel="Open the signed agreement →"
      emptyText="No signed agreement attached."
      addHint="PDF, PNG, or JPEG of the signed agreement."
      replaceHint="Replaces the attached document."
    />
  );
}
