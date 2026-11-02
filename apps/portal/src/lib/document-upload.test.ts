import { describe, expect, it } from "vitest";
import { documentExtensionFor, isAllowedDocumentUploadType } from "./document-upload";

describe("document upload types", () => {
  it("accepts a PDF and the two scan formats", () => {
    expect(["application/pdf", "image/png", "image/jpeg"].every(isAllowedDocumentUploadType)).toBe(
      true,
    );
  });

  it("refuses anything else", () => {
    expect(isAllowedDocumentUploadType("image/gif")).toBe(false);
    expect(isAllowedDocumentUploadType("")).toBe(false);
  });

  it("names the stored file by type", () => {
    expect(documentExtensionFor("application/pdf")).toBe("pdf");
    expect(documentExtensionFor("image/png")).toBe("png");
    expect(documentExtensionFor("image/jpeg")).toBe("jpg");
    expect(documentExtensionFor("text/plain")).toBe("bin");
  });
});
