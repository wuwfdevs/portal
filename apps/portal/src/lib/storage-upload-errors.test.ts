import { describe, expect, it } from "vitest";
import { describeUploadRefusal } from "./storage-upload-errors";

describe("describeUploadRefusal", () => {
  it("names the file's size and the way out when Storage says it is too big", () => {
    const result = describeUploadRefusal({
      status: 400,
      apiMessage: "The object exceeded the maximum allowed size",
      fileSizeBytes: 55 * 1024 * 1024,
    });
    expect(result.message).toContain("55 MB");
    expect(result.message).toContain("administrator");
    expect(result.retryable).toBe(false);
  });

  it("treats a 413 as too big even without a message", () => {
    expect(describeUploadRefusal({ status: 413, fileSizeBytes: 1024 }).retryable).toBe(false);
  });

  it("passes any other refusal's own message through", () => {
    expect(
      describeUploadRefusal({ status: 403, apiMessage: "new row violates RLS", fileSizeBytes: 1 }),
    ).toEqual({ message: "new row violates RLS", retryable: false });
  });

  it("retries a server error or a rate limit, and falls back to a generic message", () => {
    expect(describeUploadRefusal({ status: 503, fileSizeBytes: 1 })).toEqual({
      message: "The upload was refused (HTTP 503).",
      retryable: true,
    });
    expect(describeUploadRefusal({ status: 429, fileSizeBytes: 1 }).retryable).toBe(true);
  });
});
