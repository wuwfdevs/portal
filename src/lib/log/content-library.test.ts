import { describe, expect, it } from "vitest";
import {
  computeTotalDurationSeconds,
  contentComponentAudioObjectPath,
  contentItemAudioObjectPath,
  isAllowedAudioType,
} from "./content-library";

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

describe("object path helpers", () => {
  it("builds a stable, extension-matched item path", () => {
    expect(contentItemAudioObjectPath("item-1", "audio/mpeg")).toBe("item-1/audio.mp3");
  });

  it("builds a stable, extension-matched component path", () => {
    expect(contentComponentAudioObjectPath("item-1", "comp-1", "audio/wav")).toBe(
      "item-1/components/comp-1.wav",
    );
  });
});

describe("computeTotalDurationSeconds", () => {
  it("sums only required components, per the design doc's 30s promo / 8s required outro example", () => {
    const total = computeTotalDurationSeconds(
      [
        { duration_seconds: 30, required: true },
        { duration_seconds: 8, required: true },
      ],
      null,
    );
    expect(total).toBe(38);
  });

  it("excludes optional components from the total", () => {
    const total = computeTotalDurationSeconds(
      [
        { duration_seconds: 30, required: true },
        { duration_seconds: 5, required: false },
      ],
      null,
    );
    expect(total).toBe(30);
  });

  it("falls back to the item's own expected duration when it has no components", () => {
    expect(computeTotalDurationSeconds([], 45)).toBe(45);
    expect(computeTotalDurationSeconds([], null)).toBeNull();
  });
});
