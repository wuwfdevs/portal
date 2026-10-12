import "server-only";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {
  exportCorrectionDb,
  ffmpegExportFilter,
  parseEbur128Summary,
} from "@/lib/sourcework/loudness";
import type { ExportLevel } from "@/lib/transcription/loudness-measure";

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
 * `level` is the excerpt's leveling (lib/sourcework/loudness.ts): its live channel fed to both
 * sides when the other is silent, one fixed gain, then a hard limiter at -6 dBFS (Audition's Hard
 * Limiter defaults). Limiting lowers the loudness of peaky tape, so the render is measured and, if
 * it landed more than 0.3 LU from where the gain intended, rendered once more with the gain
 * adjusted by the difference. With no `level.intendedLufs` (original level, or nothing measured)
 * the clip is rendered as recorded: no gain, no limiter.
 *
 * Arguments are passed as an array to spawn(), never interpolated into a
 * shell string, so there is no command-injection surface here regardless of
 * what the signed URL or timing values contain.
 */
export async function renderClipWav(
  sourceUrl: string,
  startMs: number,
  endMs: number,
  level?: ExportLevel,
): Promise<Buffer> {
  if (!level || level.intendedLufs == null) {
    return runRender(sourceUrl, startMs, endMs, null);
  }

  const render = (gainDb: number) =>
    runRender(sourceUrl, startMs, endMs, ffmpegExportFilter(gainDb, level.liveChannel));
  const first = await render(level.gainDb);

  const rendered = await measureWavLoudness(first);
  if (rendered == null) return first;
  const correction = exportCorrectionDb(level.intendedLufs, rendered);
  return correction == null ? first : render(level.gainDb + correction);
}

function runRender(
  sourceUrl: string,
  startMs: number,
  endMs: number,
  audioFilter: string | null,
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
      // Drop the source's tags: they describe the whole recording, not this
      // excerpt, and the piped WAV's metadata chunk made Audition warn that it
      // was corrupt.
      "-map_metadata",
      "-1",
      "-bitexact",
      ...(audioFilter ? ["-af", audioFilter] : []),
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

/**
 * Integrated loudness (LUFS) of a rendered WAV, read back through ebur128 from stdin. Null when it
 * can't be measured — the caller then keeps the render it has rather than failing the export.
 */
async function measureWavLoudness(wav: Buffer): Promise<number | null> {
  if (!ffmpegPath) return null;
  const ffmpegBinary: string = ffmpegPath;

  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegBinary, [
      "-hide_banner",
      "-nostats",
      "-loglevel",
      "info",
      "-i",
      "pipe:0",
      "-af",
      "ebur128=peak=true:framelog=quiet",
      "-f",
      "null",
      "-",
    ]);
    const stderrChunks: Buffer[] = [];
    ffmpeg.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.stdin.on("error", () => {});
    ffmpeg.on("error", () => resolve(null));
    ffmpeg.on("close", (code: number | null) => {
      resolve(
        code === 0
          ? (parseEbur128Summary(Buffer.concat(stderrChunks).toString("utf-8"))?.integratedLufs ??
              null)
          : null,
      );
    });
    ffmpeg.stdin.end(wav);
  });
}
