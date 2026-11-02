import { describe, expect, it } from "vitest";
import {
  computeAutoGain,
  dbToLinear,
  effectiveGain,
  exportCorrectionDb,
  ffmpegExportFilter,
  ffmpegGainFilter,
  ffmpegLiveChannelFilter,
  FFMPEG_LIMITER_FILTER,
  formatGainDb,
  liveChannelFromRms,
  loudnessState,
  parseAstatsChannelRms,
  parseEbur128Summary,
} from "./loudness";

const SUMMARY = `
[Parsed_ebur128_0 @ 0x5581] Summary:

  Integrated loudness:
    I:         -31.4 LUFS
    Threshold: -41.9 LUFS

  Loudness range:
    LRA:        11.2 LU
    LRA low:   -38.0 LUFS
    LRA high:  -26.8 LUFS

  True peak:
    Peak:       -9.6 dBFS
`;

describe("parseEbur128Summary", () => {
  it("reads integrated loudness and true peak", () => {
    expect(parseEbur128Summary(SUMMARY)).toEqual({ integratedLufs: -31.4, truePeakDbtp: -9.6 });
  });

  it("uses the last summary when the log has more than one", () => {
    const text = `${SUMMARY.replace("-31.4", "-10.0")}\n${SUMMARY}`;
    expect(parseEbur128Summary(text)?.integratedLufs).toBe(-31.4);
  });

  it("returns null for silence and for missing output", () => {
    expect(parseEbur128Summary(SUMMARY.replace("-31.4", "-inf"))).toBeNull();
    expect(parseEbur128Summary("ffmpeg: no such file")).toBeNull();
  });
});

describe("computeAutoGain", () => {
  it("lifts quiet tape to the target", () => {
    expect(computeAutoGain({ loudnessLufs: -31.4, durationMs: 20_000 })).toEqual({
      gainDb: 13.4,
      limitedBy: null,
      noisyBoost: false,
      measured: true,
    });
  });

  it("cuts hot tape to the target", () => {
    expect(computeAutoGain({ loudnessLufs: -10, durationMs: 20_000 }).gainDb).toBe(-8);
  });

  it("does not hold a boost back for peak headroom — the limiter handles peaks", () => {
    const result = computeAutoGain({ loudnessLufs: -30, durationMs: 20_000 });
    expect(result.gainDb).toBe(12);
    expect(result.limitedBy).toBeNull();
  });

  it("allows the 35-42 dB boosts field tape commonly needs", () => {
    const result = computeAutoGain({ loudnessLufs: -58, durationMs: 20_000 });
    expect(result.gainDb).toBe(40);
    expect(result.limitedBy).toBeNull();
  });

  it("flags a large boost as raising the noise floor", () => {
    expect(computeAutoGain({ loudnessLufs: -38, durationMs: 20_000 }).noisyBoost).toBe(false);
    expect(computeAutoGain({ loudnessLufs: -38.5, durationMs: 20_000 }).noisyBoost).toBe(true);
    expect(computeAutoGain({ loudnessLufs: -50, durationMs: 20_000 }).noisyBoost).toBe(true);
  });

  it("boosts the quietest measurable tape without hitting the cap", () => {
    // Just above the silence floor is the largest boost the target can ask for (42 dB): inside the
    // 45 dB maximum, which stays as a guard should either constant change.
    const result = computeAutoGain({ loudnessLufs: -59.9, durationMs: 20_000 });
    expect(result.gainDb).toBe(41.9);
    expect(result.limitedBy).toBeNull();
    expect(result.noisyBoost).toBe(true);
  });

  it("is gentler on a clip too short to measure", () => {
    const result = computeAutoGain({ loudnessLufs: -40, durationMs: 1500 });
    expect(result.gainDb).toBe(6);
    expect(result.limitedBy).toBe("short");
    expect(result.noisyBoost).toBe(false);
  });

  it("caps an extreme cut", () => {
    const result = computeAutoGain({ loudnessLufs: 12, durationMs: 20_000 });
    expect(result.gainDb).toBe(-24);
    expect(result.limitedBy).toBe("cut");
  });

  it("changes nothing when there is no measurement or only silence", () => {
    expect(computeAutoGain({ loudnessLufs: null, durationMs: 9000 })).toEqual({
      gainDb: 0,
      limitedBy: null,
      noisyBoost: false,
      measured: false,
    });
    expect(computeAutoGain({ loudnessLufs: -70, durationMs: 9000 }).gainDb).toBe(0);
  });
});

describe("effectiveGain", () => {
  const measured = { loudnessLufs: -31.4, durationMs: 20_000 };

  it("follows the measurement in auto mode", () => {
    expect(effectiveGain({ gainMode: "auto", ...measured }).gainDb).toBe(13.4);
  });

  it("applies nothing at the original level", () => {
    const result = effectiveGain({ gainMode: "off", ...measured });
    expect(result.gainDb).toBe(0);
    expect(result.measured).toBe(false);
  });
});

describe("one-sided stereo", () => {
  const ASTATS = `
[Parsed_astats_0 @ 0x1] Channel: 1
[Parsed_astats_0 @ 0x1] RMS level dB: -21.073730
[Parsed_astats_0 @ 0x1] Channel: 2
[Parsed_astats_0 @ 0x1] RMS level dB: -inf
[Parsed_astats_0 @ 0x1] Overall
[Parsed_astats_0 @ 0x1] RMS level dB: -24.084030
`;

  it("reads per-channel RMS and leaves the overall figure out", () => {
    expect(parseAstatsChannelRms(ASTATS)).toEqual([-21.07373, -Infinity]);
    expect(parseAstatsChannelRms("nothing here")).toEqual([]);
  });

  it("finds the live channel when the other is more than 40 dB down", () => {
    expect(liveChannelFromRms([-20, -61])).toBe(0);
    expect(liveChannelFromRms([-70, -22])).toBe(1);
    expect(liveChannelFromRms([-20, -Infinity])).toBe(0);
  });

  it("leaves ordinary clips alone", () => {
    expect(liveChannelFromRms([-20, -45])).toBeNull();
    expect(liveChannelFromRms([-20, -60])).toBeNull();
    expect(liveChannelFromRms([-22])).toBeNull();
    expect(liveChannelFromRms([-20, -20, -20])).toBeNull();
    expect(liveChannelFromRms([-Infinity, -Infinity])).toBeNull();
  });

  it("builds the pan that feeds both sides from the live channel", () => {
    expect(ffmpegLiveChannelFilter(0)).toBe("pan=stereo|c0=c0|c1=c0");
    expect(ffmpegLiveChannelFilter(1)).toBe("pan=stereo|c0=c1|c1=c1");
    expect(ffmpegLiveChannelFilter(null)).toBeNull();
  });
});

describe("export filter", () => {
  it("limits at -6 dBFS with Audition's hard limiter defaults and no makeup gain", () => {
    expect(FFMPEG_LIMITER_FILTER).toBe("alimiter=limit=0.5012:attack=5:release=50:level=false");
  });

  it("orders the live channel, then the gain, then the limiter", () => {
    expect(ffmpegExportFilter(13.4, 1)).toBe(
      `pan=stereo|c0=c1|c1=c1,volume=13.4dB,${FFMPEG_LIMITER_FILTER}`,
    );
    expect(ffmpegExportFilter(0, null)).toBe(FFMPEG_LIMITER_FILTER);
  });

  it("asks for a second render only when limiting left the file more than 0.3 LU off", () => {
    expect(exportCorrectionDb(-18, -18.2)).toBeNull();
    expect(exportCorrectionDb(-18, -17.8)).toBeNull();
    expect(exportCorrectionDb(-18, -19.4)).toBe(1.4);
    expect(exportCorrectionDb(-18, -16.5)).toBe(-1.5);
  });
});

describe("helpers", () => {
  it("converts decibels to a multiplier", () => {
    expect(dbToLinear(0)).toBe(1);
    expect(dbToLinear(6)).toBeCloseTo(1.995, 2);
    expect(dbToLinear(-20)).toBeCloseTo(0.1, 5);
  });

  it("formats gain with a real minus sign", () => {
    expect(formatGainDb(3.2)).toBe("+3.2 dB");
    expect(formatGainDb(-4)).toBe("−4.0 dB");
    expect(formatGainDb(0)).toBe("0 dB");
  });

  it("builds an ffmpeg filter only when there is a gain to apply", () => {
    expect(ffmpegGainFilter(0)).toBeNull();
    expect(ffmpegGainFilter(-6.25)).toBe("volume=-6.3dB");
    expect(ffmpegGainFilter(3)).toBe("volume=3.0dB");
  });
});

describe("loudnessState", () => {
  it("is pending until a measurement has been attempted", () => {
    expect(loudnessState({ measuredAt: null, loudnessLufs: null })).toBe("pending");
  });

  it("is measured once there is a loudness, even while a remeasure is under way", () => {
    expect(loudnessState({ measuredAt: "2026-10-12T16:20:27Z", loudnessLufs: -26.5 })).toBe(
      "measured",
    );
  });

  it("is unavailable when an attempt left nothing — silent or unreadable audio", () => {
    expect(loudnessState({ measuredAt: "2026-10-12T16:20:27Z", loudnessLufs: null })).toBe(
      "unavailable",
    );
  });
});
