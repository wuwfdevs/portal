// Loudness for excerpts: one fixed gain per excerpt toward the level the WUWF team preps actualities
// at in Audition, followed by a hard limiter. Pure and shared by the server (measuring, export) and
// the browser (playback), the way piece-text.ts is. Measurement itself is
// lib/transcription/loudness-measure.ts; the limiter is ffmpeg's alimiter at export and a
// DynamicsCompressorNode approximation at playback.
//
// The standard is -18 LUFS integrated with a -6 dBFS limiter ceiling. That matches the team's own
// Audition practice (normalize to 100%, then hard-limit at -6 dB, which measures about -14 to -21
// LUFS). NPR's -24 LUFS is a distribution spec, and it played noticeably quiet next to the team's work.

/** Integrated loudness every excerpt is brought to before limiting. */
export const TARGET_LUFS = -18;
/** The hard limiter's ceiling. Peaks the gain pushes past it are limited, not allowed to cut the gain. */
export const LIMITER_CEILING_DBFS = -6;
/** Biggest lift or cut automatic gain will apply; beyond it the tape is flagged, not rescued. Field tape commonly needs 35-42 dB. */
export const MAX_AUTO_BOOST_DB = 45;
export const MAX_AUTO_CUT_DB = 24;
/** A boost past this raises the tape's noise floor with it, which the card says. */
export const NOISY_BOOST_DB = 20;
/** BS.1770 integrated loudness needs a few seconds to settle; a shorter clip gets a gentler limit. */
export const SHORT_CLIP_MS = 3000;
export const SHORT_CLIP_MAX_CHANGE_DB = 6;
/** Below this the measurement is silence or noise floor, not speech. */
export const SILENCE_LUFS = -60;
/** A channel this far below the other is silence, not a quiet voice: the clip is one-sided. */
export const ONE_SIDED_CHANNEL_DB = 40;
/** How far a rendered export may land from its intended loudness before it is rendered again. */
export const EXPORT_TOLERANCE_LU = 0.3;

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
  durationMs: number;
}

/** Why automatic gain landed short of the target, so the screen can say so. */
export type GainLimit = "boost" | "cut" | "short" | null;

/** The live side of a stereo clip whose other channel is silent: 0 = left, 1 = right. Null = ordinary. */
export type LiveChannel = 0 | 1;

export interface ExcerptGain {
  gainDb: number;
  limitedBy: GainLimit;
  /** A boost large enough to raise the noise floor noticeably. Independent of limitedBy. */
  noisyBoost: boolean;
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
 * The gain that brings an excerpt to the target. Peaks are not a reason to hold it back — the
 * limiter after the gain handles them. Clamped to a sane range, and gentler for a clip too short
 * to measure reliably.
 */
export function computeAutoGain(input: {
  loudnessLufs: number | null;
  durationMs: number;
}): ExcerptGain {
  const { loudnessLufs, durationMs } = input;
  if (loudnessLufs == null || loudnessLufs <= SILENCE_LUFS) {
    return { gainDb: 0, limitedBy: null, noisyBoost: false, measured: false };
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

  return { gainDb: round1(gain), limitedBy, noisyBoost: gain > NOISY_BOOST_DB, measured: true };
}

/** The gain actually applied to an excerpt: none when it is set to its original level. */
export function effectiveGain(input: ExcerptGainInput): ExcerptGain {
  if (input.gainMode === "off")
    return { gainDb: 0, limitedBy: null, noisyBoost: false, measured: false };
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

/**
 * Per-channel RMS levels (dB) from the summary ffmpeg's astats filter prints to stderr, in channel
 * order. Digital silence prints "-inf" and comes back as -Infinity. Empty when there is no summary.
 */
export function parseAstatsChannelRms(stderr: string): number[] {
  const summaryAt = stderr.lastIndexOf("Channel: 1");
  if (summaryAt === -1) return [];
  const overallAt = stderr.indexOf("Overall", summaryAt);
  const perChannel = stderr.slice(summaryAt, overallAt === -1 ? undefined : overallAt);
  const levels: number[] = [];
  for (const match of perChannel.matchAll(/RMS level dB:\s*(-?[\d.]+|-inf)/gi)) {
    levels.push(match[1]?.toLowerCase() === "-inf" ? -Infinity : Number(match[1]));
  }
  return levels;
}

/**
 * Which channel of a stereo clip carries the audio when the other is silent (field clips with the
 * voice on the left only). Null for mono, anything wider than stereo, a clip with both channels
 * live, and one with nothing in either.
 */
export function liveChannelFromRms(rmsDb: number[]): LiveChannel | null {
  if (rmsDb.length !== 2) return null;
  const [left = -Infinity, right = -Infinity] = rmsDb;
  if (left === -Infinity && right === -Infinity) return null;
  if (left - right > ONE_SIDED_CHANNEL_DB) return 0;
  if (right - left > ONE_SIDED_CHANNEL_DB) return 1;
  return null;
}

/**
 * The ffmpeg filter that feeds both sides from the live channel of a one-sided clip, so it measures
 * and plays as the centered voice it is; null when the clip is ordinary. A one-sided clip otherwise
 * measures about 3 dB low and drops about 6 dB when summed to mono.
 */
export function ffmpegLiveChannelFilter(
  liveChannel: LiveChannel | null | undefined,
): string | null {
  if (liveChannel == null) return null;
  return `pan=stereo|c0=c${liveChannel}|c1=c${liveChannel}`;
}

/** ffmpeg's alimiter at Audition's Hard Limiter defaults. level=false stops alimiter adding makeup gain. */
export const FFMPEG_LIMITER_FILTER = `alimiter=limit=${(10 ** (LIMITER_CEILING_DBFS / 20)).toFixed(4)}:attack=5:release=50:level=false`;

/** The whole export chain: live channel, then gain, then the limiter. */
export function ffmpegExportFilter(
  gainDb: number,
  liveChannel: LiveChannel | null | undefined,
): string {
  return [ffmpegLiveChannelFilter(liveChannel), ffmpegGainFilter(gainDb), FFMPEG_LIMITER_FILTER]
    .filter((part): part is string => part != null)
    .join(",");
}

/**
 * How far to re-render an export to land on its intended loudness after limiting took some of it
 * away: the gain to add in dB, or null when the render is already within tolerance.
 */
export function exportCorrectionDb(intendedLufs: number, renderedLufs: number): number | null {
  const difference = intendedLufs - renderedLufs;
  return Math.abs(difference) > EXPORT_TOLERANCE_LU ? round1(difference) : null;
}

/** Settings for the browser's approximation of the limiter (a DynamicsCompressorNode). */
export const PLAYBACK_LIMITER = {
  threshold: LIMITER_CEILING_DBFS,
  knee: 0,
  ratio: 20,
  attack: 0.003,
  release: 0.05,
} as const;
