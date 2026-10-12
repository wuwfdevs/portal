import "server-only";
import { spawn } from "node:child_process";
import { after } from "next/server";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import {
  effectiveGain,
  parseEbur128Summary,
  type GainMode,
  type LoudnessMeasurement,
} from "@/lib/sourcework/loudness";

// Measures an excerpt's gated integrated loudness and true peak (ITU-R BS.1770 via ffmpeg's
// ebur128 filter) and keeps the numbers on the excerpt. Measuring never changes audio; the gain
// derived from it (lib/sourcework/loudness.ts) is applied at playback and at export.

const MEASURE_TIMEOUT_MS = 60_000;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Reads [startMs, endMs) of a source URL through ebur128. Input-seeking and a duration limit, so
 * ffmpeg range-requests only the excerpt rather than the whole recording. Null when the audio is
 * silent, ffmpeg is unavailable, or it fails or takes too long — callers treat that as "no
 * measurement yet", never as an error to show.
 */
export async function measureRangeLoudness(
  sourceUrl: string,
  startMs: number,
  endMs: number,
): Promise<LoudnessMeasurement | null> {
  if (!ffmpegPath) return null;
  const ffmpegBinary: string = ffmpegPath;

  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegBinary, [
      "-hide_banner",
      "-nostats",
      "-loglevel",
      "info",
      "-ss",
      (startMs / 1000).toFixed(3),
      "-i",
      sourceUrl,
      "-t",
      ((endMs - startMs) / 1000).toFixed(3),
      "-vn",
      "-af",
      "ebur128=peak=true:framelog=quiet",
      "-f",
      "null",
      "-",
    ]);

    const stderrChunks: Buffer[] = [];
    ffmpeg.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    const timer = setTimeout(() => ffmpeg.kill("SIGKILL"), MEASURE_TIMEOUT_MS);
    ffmpeg.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    ffmpeg.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve(
        code === 0 ? parseEbur128Summary(Buffer.concat(stderrChunks).toString("utf-8")) : null,
      );
    });
  });
}

/**
 * Measures one temporal excerpt and stores the result. `loudness_measured_at` records that a
 * measurement was *attempted*, so an excerpt whose audio can't be read isn't retried on every
 * page view; its numbers stay null and it plays and exports at its original level.
 *
 * Best-effort by design: it runs after the write that triggered it. The write is conditioned on
 * the range still being the one measured, so a stale result from a trim that has since moved on
 * is dropped instead of overwriting the newer one.
 */
export async function measureAndStoreExcerptLoudness(
  supabase: SupabaseClient,
  excerptId: string,
): Promise<void> {
  try {
    const { data: excerpt, error } = await supabase
      .from("sw_source_excerpts")
      .select("source_id, start_ms, end_ms")
      .eq("id", excerptId)
      .maybeSingle();
    if (error || !excerpt || excerpt.start_ms == null || excerpt.end_ms == null) return;

    const { data: source, error: sourceError } = await supabase
      .from("sw_sources")
      .select("original_storage_path")
      .eq("id", excerpt.source_id)
      .maybeSingle();
    if (sourceError) return;
    const sourceUrl = source?.original_storage_path
      ? await getSignedMediaUrl(source.original_storage_path)
      : null;

    const measurement = sourceUrl
      ? await measureRangeLoudness(sourceUrl, excerpt.start_ms, excerpt.end_ms)
      : null;

    const { error: writeError } = await supabase
      .from("sw_source_excerpts")
      .update({
        loudness_lufs: measurement?.integratedLufs ?? null,
        true_peak_dbtp: measurement?.truePeakDbtp ?? null,
        loudness_measured_at: new Date().toISOString(),
      })
      .eq("id", excerptId)
      .eq("start_ms", excerpt.start_ms)
      .eq("end_ms", excerpt.end_ms);
    if (writeError) console.error("Could not store the excerpt's loudness:", writeError);
  } catch (error) {
    console.error("Could not measure the excerpt's loudness:", error);
  }
}

/**
 * The gain to render an excerpt's export with. An excerpt that was never measured (made before
 * loudness existed, or exported before the background measure finished) is measured here, from the
 * same signed URL the render uses, so the file that gets cached isn't left at its original level.
 */
export async function gainDbForExport(
  excerpt: {
    start_ms: number;
    end_ms: number;
    gain_mode: GainMode;
    loudness_lufs: number | null;
    true_peak_dbtp: number | null;
    loudness_measured_at: string | null;
  },
  sourceUrl: string,
): Promise<number> {
  let { loudness_lufs: loudnessLufs, true_peak_dbtp: truePeakDbtp } = excerpt;
  if (excerpt.gain_mode === "auto" && excerpt.loudness_measured_at == null) {
    const measurement = await measureRangeLoudness(sourceUrl, excerpt.start_ms, excerpt.end_ms);
    loudnessLufs = measurement?.integratedLufs ?? null;
    truePeakDbtp = measurement?.truePeakDbtp ?? null;
  }
  return effectiveGain({
    gainMode: excerpt.gain_mode,
    loudnessLufs,
    truePeakDbtp,
    durationMs: excerpt.end_ms - excerpt.start_ms,
  }).gainDb;
}

/** Most unmeasured excerpts one read queues for measuring; the rest follow on later reads. */
const BACKFILL_LIMIT = 8;

/**
 * Queues the excerpts that were never measured (made before loudness existed) to be measured after
 * the response, a few at a time — the best-effort pattern Resources uses for its embeddings. The
 * client is passed in because request cookies aren't readable inside after(). Never throws: outside
 * a request there is simply nothing to queue onto.
 */
export function queueLoudnessBackfill(
  supabase: SupabaseClient,
  excerpts: { id: string; loudness_measured_at: string | null }[],
): void {
  const pending = excerpts.filter((e) => e.loudness_measured_at == null).slice(0, BACKFILL_LIMIT);
  if (pending.length === 0) return;
  try {
    after(async () => {
      for (const excerpt of pending) await measureAndStoreExcerptLoudness(supabase, excerpt.id);
    });
  } catch {
    // Not in a request scope (a script, a test): measuring happens on the next page view instead.
  }
}
