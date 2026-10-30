import { describe, expect, it } from "vitest";
import { storageObjectUploadUrl } from "./storage-upload";

describe("storageObjectUploadUrl", () => {
  it("joins base, bucket and path", () => {
    expect(
      storageObjectUploadUrl("https://x.supabase.co", "transcription-media", "abc/source.wav"),
    ).toBe("https://x.supabase.co/storage/v1/object/transcription-media/abc/source.wav");
  });

  it("encodes each segment but keeps the slashes, and tolerates a trailing slash on the base", () => {
    expect(storageObjectUploadUrl("https://x.supabase.co/", "b", "a b/c#d.wav")).toBe(
      "https://x.supabase.co/storage/v1/object/b/a%20b/c%23d.wav",
    );
  });
});
