import "server-only";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/**
 * Renders one clip's [startMs, endMs) range from a source media URL to a
 * 48kHz/16-bit PCM WAV buffer, via ffmpeg-static (see
 * docs/transcription-workspace-design.md §6 — no transcode pipeline exists
 * elsewhere in this app; this is the one place ffmpeg runs). Input-seeking
 * (-ss before -i) so ffmpeg can use HTTP range requests against the signed
 * URL rather than downloading from the start of the file — the tradeoff is
 * approximate (keyframe-snapped) seeking on video sources, which is why
 * clip boundaries are always nudge-and-audition rather than promised to be
 * sample-exact.
 *
 * Arguments are passed as an array to spawn(), never interpolated into a
 * shell string, so there is no command-injection surface here regardless of
 * what the signed URL or timing values contain.
 */
export async function renderClipWav(
  sourceUrl: string,
  startMs: number,
  endMs: number,
): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary is not available in this environment");
  }
  const ffmpegBinary: string = ffmpegPath;

  const startSeconds = (startMs / 1000).toFixed(3);
  const durationSeconds = ((endMs - startMs) / 1000).toFixed(3);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegBinary, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      startSeconds,
      "-i",
      sourceUrl,
      "-t",
      durationSeconds,
      "-vn",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "pipe:1",
    ]);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code: number | null) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
      } else {
        const message = Buffer.concat(stderrChunks).toString("utf-8").trim().slice(0, 500);
        reject(new Error(`ffmpeg exited with code ${code}${message ? `: ${message}` : ""}`));
      }
    });
  });
}
