/**
 * Minimal RIFF/WAV parsing — just enough to answer two questions about a
 * chunk emitted by extendable-media-recorder: does it carry a real header,
 * and if so, where does the PCM data start and what format is it in.
 * Not a general-purpose WAV library.
 */

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export interface ParsedWavHeader {
  format: WavFormat;
  /** Byte offset in the buffer where PCM samples begin (after the "data" chunk header). */
  dataOffset: number;
}

/** True if the buffer starts with a RIFF....WAVE header. */
export function hasRiffHeader(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

/**
 * Walks RIFF subchunks to find "fmt " (format) and "data" (PCM start).
 * Throws if either is missing — better to fail loudly than guess.
 */
export function parseWavHeader(buffer: Buffer): ParsedWavHeader {
  if (!hasRiffHeader(buffer)) {
    throw new Error("parseWavHeader: buffer does not start with a RIFF/WAVE header");
  }

  let offset = 12; // past "RIFF" + size + "WAVE"
  let format: WavFormat | null = null;
  let dataOffset: number | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;

    if (chunkId === "fmt ") {
      format = {
        channels: buffer.readUInt16LE(bodyStart + 2),
        sampleRate: buffer.readUInt32LE(bodyStart + 4),
        bitsPerSample: buffer.readUInt16LE(bodyStart + 14),
      };
    } else if (chunkId === "data") {
      dataOffset = bodyStart;
      break; // PCM data follows; nothing after this matters for our purposes
    }

    offset = bodyStart + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (!format) throw new Error("parseWavHeader: no fmt chunk found");
  if (dataOffset === null) throw new Error("parseWavHeader: no data chunk found");

  return { format, dataOffset };
}
