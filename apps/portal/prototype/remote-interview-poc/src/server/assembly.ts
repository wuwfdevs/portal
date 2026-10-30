import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import { hasRiffHeader, parseWavHeader, type WavFormat } from "../shared/wav.ts";
import { listPartSequences, partPath, masterPath, trackDir } from "./storage-paths.ts";

export interface AssembleResult {
  path: string;
  sizeBytes: number;
  partCount: number;
  format: WavFormat;
}

/**
 * Concatenates a track's parts in sequence order into one WAV file.
 *
 * Empirically confirmed (test/chunk-dump.ts) against the pinned
 * extendable-media-recorder version: only the first part carries a real
 * RIFF/WAVE header; later parts are headerless raw PCM. This function does
 * NOT hardcode that assumption — it inspects each part's actual bytes and
 * branches accordingly, so it stays correct even if that behavior changes.
 * If literally no part has a header, it fails loudly rather than guessing a
 * format, per the design doc's "never silently substitute" principle.
 */
export async function assembleTrack(trackId: string): Promise<AssembleResult> {
  const sequences = await listPartSequences(trackId);
  if (sequences.length === 0) {
    throw new Error(`no parts found for track ${trackId}`);
  }

  let format: WavFormat | null = null;
  const pcmSegments: Buffer[] = [];

  for (const sequence of sequences) {
    const buffer = await fs.readFile(partPath(trackId, sequence));
    if (hasRiffHeader(buffer)) {
      const parsed = parseWavHeader(buffer);
      format ??= parsed.format;
      pcmSegments.push(buffer.subarray(parsed.dataOffset));
    } else {
      pcmSegments.push(buffer);
    }
  }

  if (!format) {
    throw new Error(
      `assembleTrack(${trackId}): no part carried a RIFF header — cannot determine sample format`,
    );
  }

  const pcm = Buffer.concat(pcmSegments);
  const outPath = masterPath(trackId);
  await fs.mkdir(trackDir(trackId), { recursive: true });

  await runFfmpegPcmToWav(pcm, format, outPath);

  const { size } = await fs.stat(outPath);
  return { path: outPath, sizeBytes: size, partCount: sequences.length, format };
}

function runFfmpegPcmToWav(pcm: Buffer, format: WavFormat, outPath: string): Promise<void> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary is not available in this environment");
  }
  const ffmpegBinary: string = ffmpegPath;

  const sampleFormat = format.bitsPerSample === 16 ? "s16le" : `s${format.bitsPerSample}le`;

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegBinary, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      sampleFormat,
      "-ar",
      String(format.sampleRate),
      "-ac",
      String(format.channels),
      "-i",
      "pipe:0",
      "-c:a",
      "pcm_s16le",
      outPath,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });

    ffmpeg.stdin.end(pcm);
  });
}
