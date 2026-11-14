import { describe, expect, it } from "vitest";
import { checkRecordingFile, recordingContentType } from "./attach-recording";

describe("recordingContentType", () => {
  it("uses the browser's type, then the extension", () => {
    expect(recordingContentType({ name: "a.bin", type: "audio/mpeg" })).toBe("audio/mpeg");
    expect(recordingContentType({ name: "Table 3.M4A", type: "" })).toBe("audio/mp4");
    expect(recordingContentType({ name: "notes.pdf", type: "application/pdf" })).toBeNull();
  });
});

describe("checkRecordingFile", () => {
  it("accepts audio under 50 MB and says why it refuses the rest", () => {
    expect(checkRecordingFile({ name: "t.mp3", type: "audio/mpeg", size: 10_000_000 })).toEqual({ ok: true, contentType: "audio/mpeg" });
    expect(checkRecordingFile({ name: "t.mp3", type: "audio/mpeg", size: 0 }).ok).toBe(false);
    const big = checkRecordingFile({ name: "t.wav", type: "audio/wav", size: 60 * 1024 * 1024 });
    expect(big.ok === false && big.message).toContain("50 MB");
    expect(checkRecordingFile({ name: "t.txt", type: "text/plain", size: 10 }).ok).toBe(false);
  });
});
