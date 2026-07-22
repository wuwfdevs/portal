import { describe, expect, it } from "vitest";
import {
  extensionForContentType,
  formatBytes,
  formatDuration,
  isAllowedMediaType,
  isVideoContentType,
  sourceObjectPath,
} from "./media";

describe("isAllowedMediaType", () => {
  it("accepts browser-playable audio and video formats", () => {
    expect(isAllowedMediaType("audio/wav")).toBe(true);
    expect(isAllowedMediaType("video/mp4")).toBe(true);
  });

  it("rejects formats outside the upload allow-list", () => {
    expect(isAllowedMediaType("application/octet-stream")).toBe(false);
    expect(isAllowedMediaType("video/x-msvideo")).toBe(false);
  });
});

describe("extensionForContentType", () => {
  it("maps known content types to their extension", () => {
    expect(extensionForContentType("audio/mpeg")).toBe("mp3");
    expect(extensionForContentType("video/quicktime")).toBe("mov");
  });

  it("falls back to a generic extension for unknown types", () => {
    expect(extensionForContentType("application/octet-stream")).toBe("bin");
  });
});

describe("isVideoContentType", () => {
  it("distinguishes video from audio content types", () => {
    expect(isVideoContentType("video/mp4")).toBe(true);
    expect(isVideoContentType("audio/wav")).toBe(false);
  });
});

describe("sourceObjectPath", () => {
  it("places a project's source file at <project id>/source.<ext>", () => {
    expect(sourceObjectPath("abc-123", "audio/wav")).toBe("abc-123/source.wav");
  });
});

describe("formatBytes", () => {
  it("formats bytes, KB, MB, and GB with reasonable precision", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2.3 * 1024 * 1024 * 1024)).toBe("2.3 GB");
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(9_000)).toBe("0:09");
  });

  it("formats hour-plus durations as h:mm:ss", () => {
    expect(formatDuration(3_661_000)).toBe("1:01:01");
  });
});
