// Loudness for excerpts: one fixed gain per excerpt, so actualities play back at roughly the same
// level without touching the dynamics inside one (a speaker who drops to a whisper stays that far
// below their own normal voice). Pure and shared by the server (measuring, export) and the browser
// (playback), the way piece-text.ts is. Measurement itself is lib/transcription/loudness-measure.ts.
//
// The target is NPR's/PRSS's broadcast spec — -24 LUFS (ITU-R BS.1770, ±2 LU) with peaks under
// -3 dBTP — from 2014-15 reporting, not a current NPR document. Confirm before relying on it.

/** Integrated loudness every excerpt is brought to. */
export const TARGET_LUFS = -24;
/** The true peak a gain is never allowed to push an excerpt past. */
export const TRUE_PEAK_CEILING_DBTP = -3;
/** Biggest lift or cut automatic gain will apply; beyond it the tape is flagged, not rescued. */
export const MAX_AUTO_BOOST_DB = 15;
export const MAX_AUTO_CUT_DB = 24;
/** BS.1770 integrated loudness needs a few seconds to settle; a shorter clip gets a gentler limit. */
export const SHORT_CLIP_MS = 3000;
export const SHORT_CLIP_MAX_CHANGE_DB = 6;
/** Below this the measurement is silence or noise floor, not speech. */
export const SILENCE_LUFS = -60;

/** auto = levelled toward the target; off = played and exported as recorded. */
export type GainMode = "auto" | "off";

export interface LoudnessMeasurement {
  /** Gated integrated loudness, LUFS. */
  integratedLufs: number;
  /** True peak, dBTP. */
  truePeakDbtp: number;
}

export interface ExcerptGainInput {
  gainMode: GainMode;
  loudnessLufs: number | null;
  truePeakDbtp: number | null;
  durationMs: number;
}

/** Why automatic gain landed short of the target, so the screen can say so. */
export type GainLimit = "peak" | "boost" | "cut" | "short" | null;

export interface ExcerptGain {
  gainDb: number;
  limitedBy: GainLimit;
  /** Whether the number comes from a measurement (or an override) rather than the default of no change. */
  measured: boolean;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Parses the Summary block ffmpeg's ebur128 filter prints to stderr. Null when it is missing or
 * the audio was digital silence ("-inf"), where there is nothing to measure.
 */
export function parseEbur128Summary(stderr: string): LoudnessMeasurement | null {
  const summaryAt = stderr.lastIndexOf("Summary:");
  if (summaryAt === -1) return null;
  const summary = stderr.slice(summaryAt);

  const loudness = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/i.exec(summary);
  const peakSection = summary.slice(summary.search(/True peak:/i));
  const peak = /Peak:\s*(-?[\d.]+|-inf)\s*dBFS/i.exec(peakSection);
  if (!loudness || !peak) return null;

  const integratedLufs = Number(loudness[1]);
  const truePeakDbtp = Number(peak[1]);
  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp)) return null;
  return { integratedLufs: round1(integratedLufs), truePeakDbtp: round1(truePeakDbtp) };
}

/**
 * The gain that brings an excerpt to the target. A boost that would push the true peak past the
 * ceiling is held back so it lands a little under target rather than being squashed into it —
 * the limiter-free choice that keeps the dynamics. Clamped to a sane range, and gentler for a
 * clip too short to measure reliably.
 */
export function computeAutoGain(input: {
  loudnessLufs: number | null;
  truePeakDbtp: number | null;
  durationMs: number;
}): ExcerptGain {
  const { loudnessLufs, truePeakDbtp, durationMs } = input;
  if (loudnessLufs == null || truePeakDbtp == null || loudnessLufs <= SILENCE_LUFS) {
    return { gainDb: 0, limitedBy: null, measured: false };
  }

  let gain = TARGET_LUFS - loudnessLufs;
  let limitedBy: GainLimit = null;

  if (durationMs < SHORT_CLIP_MS && Math.abs(gain) > SHORT_CLIP_MAX_CHANGE_DB) {
    gain = Math.sign(gain) * SHORT_CLIP_MAX_CHANGE_DB;
    limitedBy = "short";
  }
  if (gain > MAX_AUTO_BOOST_DB) {
    gain = MAX_AUTO_BOOST_DB;
    limitedBy = "boost";
  } else if (gain < -MAX_AUTO_CUT_DB) {
    gain = -MAX_AUTO_CUT_DB;
    limitedBy = "cut";
  }

  const headroom = TRUE_PEAK_CEILING_DBTP - truePeakDbtp;
  if (gain > headroom) {
    gain = headroom;
    limitedBy = "peak";
  }
  return { gainDb: round1(gain), limitedBy, measured: true };
}

/** The gain actually applied to an excerpt: none when it is set to its original level. */
export function effectiveGain(input: ExcerptGainInput): ExcerptGain {
  if (input.gainMode === "off") return { gainDb: 0, limitedBy: null, measured: false };
  return computeAutoGain(input);
}

/**
 * Where an excerpt is in measuring, for the card: nothing attempted yet (`pending`), attempted
 * with a result (`measured`), or attempted with nothing to show — unreadable or silent audio
 * (`unavailable`). `loudness_measured_at` records an attempt, successful or not.
 */
export type LoudnessState = "pending" | "measured" | "unavailable";

export function loudnessState(input: {
  measuredAt: string | null;
  loudnessLufs: number | null;
}): LoudnessState {
  if (input.loudnessLufs != null) return "measured";
  return input.measuredAt == null ? "pending" : "unavailable";
}

/** dB to the linear multiplier a Web Audio GainNode takes. */
export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

/** "+3.2 dB", "−4.0 dB", "0 dB" — for the excerpt card. */
export function formatGainDb(gainDb: number): string {
  if (Math.abs(gainDb) < 0.05) return "0 dB";
  return `${gainDb > 0 ? "+" : "\u2212"}${Math.abs(gainDb).toFixed(1)} dB`;
}

/** The ffmpeg audio filter that applies a gain, or null when there is nothing to apply. */
export function ffmpegGainFilter(gainDb: number): string | null {
  if (Math.abs(gainDb) < 0.05) return null;
  return `volume=${gainDb.toFixed(1)}dB`;
}
