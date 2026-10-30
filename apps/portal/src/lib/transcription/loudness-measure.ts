import "server-only";
import { spawn } from "node:child_process";
import { after } from "next/server";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { createCoalescedRunner } from "@/lib/run-coalesced";
import {
  effectiveGain,
  ffmpegLiveChannelFilter,
  liveChannelFromRms,
  parseAstatsChannelRms,
  parseEbur128Summary,
  type GainMode,
  type LiveChannel,
  type LoudnessMeasurement,
} from "@/lib/sourcework/loudness";

// Measures an excerpt's gated integrated loudness and true peak (ITU-R BS.1770 via ffmpeg's
// ebur128 filter) and keeps the numbers on the excerpt. Measuring never changes audio; the gain
// derived from it (lib/sourcework/loudness.ts) is applied at playback and at export.
//
// A stereo clip with the voice in one channel and silence in the other is detected first (astats,
// per-channel RMS) and measured through a pan that feeds both sides from the live channel, so it
// reads at the level it plays and exports at rather than about 3 dB low.

const MEASURE_TIMEOUT_MS = 60_000;

// One measuring run per excerpt in this server instance. A screen that polls while measuring is
// under way re-reads its excerpts, and each read queues the still-unmeasured ones again; and a trim
// can land while an earlier trim is still being measured. A request that arrives mid-run is not
// dropped: it makes the active run go round once more, so the newest range is always measured last.
const runMeasuring = createCoalescedRunner();

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface RangeMeasurement extends LoudnessMeasurement {
  /** The live channel of a one-sided stereo clip; null for an ordinary one. */
  liveChannel: LiveChannel | null;
}

/** Runs ffmpeg over [startMs, endMs) of a source URL with an audio filter and returns its stderr; null on any failure. */
function runFfmpegFilter(
  sourceUrl: string,
  startMs: number,
  endMs: number,
  filter: string,
): Promise<string | null> {
  if (!ffmpegPath) return Promise.resolve(null);
  const ffmpegBinary: string = ffmpegPath;

  return new Promise((resolve) => {
    // Input-seeking and a duration limit, so ffmpeg range-requests only the excerpt rather than the
    // whole recording.
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
      filter,
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
      resolve(code === 0 ? Buffer.concat(stderrChunks).toString("utf-8") : null);
    });
  });
}

/**
 * Reads [startMs, endMs) of a source URL: first which channel is live (when one side is silent),
 * then its loudness through ebur128 with that channel fed to both sides. Null when the audio is
 * silent, ffmpeg is unavailable, or it fails or takes too long — callers treat that as "no
 * measurement yet", never as an error to show. A failed channel check alone just means the clip is
 * measured as it comes.
 */
export async function measureRangeLoudness(
  sourceUrl: string,
  startMs: number,
  endMs: number,
): Promise<RangeMeasurement | null> {
  const astats = await runFfmpegFilter(sourceUrl, startMs, endMs, "astats");
  const liveChannel = astats ? liveChannelFromRms(parseAstatsChannelRms(astats)) : null;

  const pan = ffmpegLiveChannelFilter(liveChannel);
  const ebur128 = "ebur128=peak=true:framelog=quiet";
  const stderr = await runFfmpegFilter(
    sourceUrl,
    startMs,
    endMs,
    pan ? `${pan},${ebur128}` : ebur128,
  );
  const measurement = stderr ? parseEbur128Summary(stderr) : null;
  return measurement ? { ...measurement, liveChannel } : null;
}

/**
 * Measures one temporal excerpt and stores the result. `loudness_measured_at` records that a
 * measurement was *attempted*, so an excerpt whose audio can't be read isn't retried on every
 * page view; its numbers stay null and it plays and exports at its original level.
 *
 * Best-effort by design: it runs after the write that triggered it. Each pass's write is
 * conditioned on the range still being the one it measured, so a stale result from a trim that has
 * since moved on is never stored over a newer one — and a pass that finds it was stale (or a
 * request that arrived while it ran) is followed by another pass on the current range.
 */
export async function measureAndStoreExcerptLoudness(
  supabase: SupabaseClient,
  excerptId: string,
): Promise<void> {
  await runMeasuring(excerptId, () => measureExcerptOnce(supabase, excerptId));
}

/** One measure-and-store pass. True when the range changed underneath it and nothing was stored. */
async function measureExcerptOnce(supabase: SupabaseClient, excerptId: string): Promise<boolean> {
  try {
    const { data: excerpt, error } = await supabase
      .from("sw_source_excerpts")
      .select("source_id, start_ms, end_ms")
      .eq("id", excerptId)
      .maybeSingle();
    if (error || !excerpt || excerpt.start_ms == null || excerpt.end_ms == null) return false;

    const { data: source, error: sourceError } = await supabase
      .from("sw_sources")
      .select("original_storage_path")
      .eq("id", excerpt.source_id)
      .maybeSingle();
    if (sourceError) return false;
    const sourceUrl = source?.original_storage_path
      ? await getSignedMediaUrl(source.original_storage_path)
      : null;

    const measurement = sourceUrl
      ? await measureRangeLoudness(sourceUrl, excerpt.start_ms, excerpt.end_ms)
      : null;

    const { data: written, error: writeError } = await supabase
      .from("sw_source_excerpts")
      .update({
        loudness_lufs: measurement?.integratedLufs ?? null,
        true_peak_dbtp: measurement?.truePeakDbtp ?? null,
        live_channel: measurement?.liveChannel ?? null,
        loudness_measured_at: new Date().toISOString(),
      })
      .eq("id", excerptId)
      .eq("start_ms", excerpt.start_ms)
      .eq("end_ms", excerpt.end_ms)
      .select("id");
    if (writeError) {
      console.error("Could not store the excerpt's loudness:", writeError);
      return false;
    }
    // No row matched: the excerpt was trimmed (or deleted) while this pass ran. The coalescer goes
    // round again, and a deleted excerpt then simply ends the run at the read above.
    return (written ?? []).length === 0;
  } catch (error) {
    console.error("Could not measure the excerpt's loudness:", error);
    return false;
  }
}

/** What an export is rendered with, and the loudness it should land on once limiting has had its say. */
export interface ExportLevel {
  gainDb: number;
  liveChannel: LiveChannel | null;
  /** Integrated loudness the render should measure, or null when it is not being levelled (original level, unmeasured). */
  intendedLufs: number | null;
}

/**
 * The level to render an excerpt's export at. An excerpt that was never measured (made before
 * loudness existed, or exported before the background measure finished) is measured here, from the
 * same signed URL the render uses, so the file that gets cached isn't left at its original level.
 */
export async function exportLevelFor(
  excerpt: {
    start_ms: number;
    end_ms: number;
    gain_mode: GainMode;
    loudness_lufs: number | null;
    live_channel: number | null;
    loudness_measured_at: string | null;
  },
  sourceUrl: string,
): Promise<ExportLevel> {
  let { loudness_lufs: loudnessLufs, live_channel: liveChannel } = excerpt;
  if (excerpt.gain_mode === "auto" && excerpt.loudness_measured_at == null) {
    const measurement = await measureRangeLoudness(sourceUrl, excerpt.start_ms, excerpt.end_ms);
    loudnessLufs = measurement?.integratedLufs ?? null;
    liveChannel = measurement?.liveChannel ?? null;
  }
  const gain = effectiveGain({
    gainMode: excerpt.gain_mode,
    loudnessLufs,
    durationMs: excerpt.end_ms - excerpt.start_ms,
  });
  return {
    gainDb: gain.gainDb,
    // The channel fix is part of the measurement, so it applies whenever the excerpt is levelled.
    liveChannel: gain.measured && (liveChannel === 0 || liveChannel === 1) ? liveChannel : null,
    intendedLufs: gain.measured && loudnessLufs != null ? loudnessLufs + gain.gainDb : null,
  };
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
