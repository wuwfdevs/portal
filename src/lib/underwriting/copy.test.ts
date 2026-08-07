import { describe, expect, it } from "vitest";
import { copyAudioObjectPath, isAllowedAudioType } from "./copy";

describe("isAllowedAudioType", () => {
  it("accepts the allow-listed audio types", () => {
    expect(isAllowedAudioType("audio/wav")).toBe(true);
    expect(isAllowedAudioType("audio/mpeg")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAllowedAudioType("video/mp4")).toBe(false);
    expect(isAllowedAudioType("application/pdf")).toBe(false);
  });
});

describe("copyAudioObjectPath", () => {
  it("builds a path keyed on the copy id, with an extension matching the content type", () => {
    expect(copyAudioObjectPath("copy-1", "audio/wav")).toBe("copy-1/audio.wav");
    expect(copyAudioObjectPath("copy-1", "audio/mpeg")).toBe("copy-1/audio.mp3");
  });

  it("falls back to a generic extension for an unrecognized type", () => {
    expect(copyAudioObjectPath("copy-1", "application/octet-stream")).toBe("copy-1/audio.bin");
  });
});
