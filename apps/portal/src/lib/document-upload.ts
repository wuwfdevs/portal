/**
 * The attachment types a record's "one document" upload accepts (an executed
 * agreement, a signed insertion order): a PDF, or a scan of one as PNG or
 * JPEG. Shared by every screen that attaches a document to a record.
 */
export const DOCUMENT_UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;

export const DOCUMENT_UPLOAD_ACCEPT = DOCUMENT_UPLOAD_TYPES.join(",");

export const DOCUMENT_UPLOAD_TYPE_ERROR = "That file type isn't supported. Use PDF, PNG, or JPEG.";

export function isAllowedDocumentUploadType(contentType: string): boolean {
  return (DOCUMENT_UPLOAD_TYPES as readonly string[]).includes(contentType);
}

/** The file extension a stored attachment of this type gets. */
export function documentExtensionFor(contentType: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  return "bin";
}
