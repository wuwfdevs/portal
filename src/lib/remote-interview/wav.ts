// Minimal, pure WAV-container reading — just enough to satisfy design doc
// §6's "the assembled file has been probed and found readable" requirement
// and to report a track's duration without shelling out to ffprobe (which
// ffmpeg-static doesn't bundle). Assembly always produces canonical
// PCM/mono/16-bit output (see assembly.ts's ffmpeg invocation), so this
// only needs to handle that shape, not arbitrary WAV variants.
//
// Pure and dependency-free so it runs under Vitest without mocks, per
// CLAUDE.md's testing expectations.

const RIFF = 0x46464952; // "RIFF" little-endian as uint32
const WAVE = 0x45564157; // "WAVE"
const FMT = 0x20746d66; // "fmt "
const DATA = 0x61746164; // "data"

interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
}

/** Parses a WAV file's fmt/data chunks. Returns null if the buffer isn't a readable RIFF/WAVE file. */
export function parseWav(buffer: Uint8Array): WavInfo | null {
  if (buffer.byteLength < 44) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (view.getUint32(0, true) !== RIFF) return null;
  if (view.getUint32(8, true) !== WAVE) return null;

  let offset = 12;
  let sampleRate: number | null = null;
  let channels: number | null = null;
  let bitsPerSample: number | null = null;
  let dataBytes: number | null = null;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = view.getUint32(offset, true);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === FMT && chunkStart + 16 <= buffer.byteLength) {
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (chunkId === DATA) {
      dataBytes = Math.min(chunkSize, buffer.byteLength - chunkStart);
    }

    // Chunks are word-aligned; an odd chunkSize has one byte of padding.
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (sampleRate === null || channels === null || bitsPerSample === null || dataBytes === null) {
    return null;
  }
  return { sampleRate, channels, bitsPerSample, dataBytes };
}

/** Whether `buffer` is a readable WAV file — design doc §6's assembly-time probe. */
export function isReadableWav(buffer: Uint8Array): boolean {
  return parseWav(buffer) !== null;
}

/** A WAV file's duration in milliseconds, or null if it can't be determined. */
export function wavDurationMs(buffer: Uint8Array): number | null {
  const info = parseWav(buffer);
  if (!info) return null;
  const bytesPerFrame = info.channels * (info.bitsPerSample / 8);
  if (bytesPerFrame <= 0 || info.sampleRate <= 0) return null;
  const frames = info.dataBytes / bytesPerFrame;
  return Math.round((frames / info.sampleRate) * 1000);
}
