import { describe, expect, it } from "vitest";
import { isReadableWav, parseWav, wavDurationMs } from "./wav";

/** Builds a canonical 16-bit PCM WAV buffer with `frameCount` silent frames. */
function buildWav({
  sampleRate = 48000,
  channels = 1,
  bitsPerSample = 16,
  frameCount = 100,
}: {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  frameCount?: number;
} = {}): Uint8Array {
  const bytesPerFrame = channels * (bitsPerSample / 8);
  const dataBytes = frameCount * bytesPerFrame;
  const buffer = new Uint8Array(44 + dataBytes);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, 0x46464952, true); // "RIFF"
  view.setUint32(4, 36 + dataBytes, true);
  view.setUint32(8, 0x45564157, true); // "WAVE"

  view.setUint32(12, 0x20746d66, true); // "fmt "
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true); // byte rate
  view.setUint16(32, bytesPerFrame, true); // block align
  view.setUint16(34, bitsPerSample, true);

  view.setUint32(36, 0x61746164, true); // "data"
  view.setUint32(40, dataBytes, true);

  return buffer;
}

describe("parseWav / isReadableWav", () => {
  it("reads a canonical WAV header", () => {
    const wav = buildWav({ sampleRate: 48000, channels: 1, frameCount: 48000 });
    expect(parseWav(wav)).toEqual({
      sampleRate: 48000,
      channels: 1,
      bitsPerSample: 16,
      dataBytes: 48000 * 2,
    });
    expect(isReadableWav(wav)).toBe(true);
  });

  it("rejects a buffer that isn't RIFF/WAVE", () => {
    const notWav = new Uint8Array(64);
    expect(parseWav(notWav)).toBeNull();
    expect(isReadableWav(notWav)).toBe(false);
  });

  it("rejects a truncated buffer", () => {
    const tooShort = new Uint8Array(20);
    expect(parseWav(tooShort)).toBeNull();
  });
});

describe("wavDurationMs", () => {
  it("computes duration from sample count and rate", () => {
    const wav = buildWav({ sampleRate: 48000, channels: 1, frameCount: 48000 });
    expect(wavDurationMs(wav)).toBe(1000);
  });

  it("accounts for channel count", () => {
    const wav = buildWav({ sampleRate: 48000, channels: 2, frameCount: 24000 });
    expect(wavDurationMs(wav)).toBe(500);
  });

  it("returns null for an unreadable buffer", () => {
    expect(wavDurationMs(new Uint8Array(10))).toBeNull();
  });
});
