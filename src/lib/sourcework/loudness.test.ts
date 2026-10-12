import { describe, expect, it } from "vitest";
import {
  computeAutoGain,
  dbToLinear,
  effectiveGain,
  ffmpegGainFilter,
  formatGainDb,
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
    expect(computeAutoGain({ loudnessLufs: -31.4, truePeakDbtp: -12, durationMs: 20_000 })).toEqual(
      {
        gainDb: 7.4,
        limitedBy: null,
        measured: true,
      },
    );
  });

  it("cuts hot tape to the target", () => {
    expect(
      computeAutoGain({ loudnessLufs: -16, truePeakDbtp: -1, durationMs: 20_000 }).gainDb,
    ).toBe(-8);
  });

  it("holds a boost back rather than letting the peak pass the ceiling", () => {
    const result = computeAutoGain({ loudnessLufs: -30, truePeakDbtp: -5, durationMs: 20_000 });
    expect(result.gainDb).toBe(2);
    expect(result.limitedBy).toBe("peak");
  });

  it("still cuts a hot clip whose peak is over the ceiling", () => {
    const result = computeAutoGain({ loudnessLufs: -18, truePeakDbtp: 0, durationMs: 20_000 });
    expect(result.gainDb).toBe(-6);
    expect(result.limitedBy).toBeNull();
  });

  it("caps an extreme boost", () => {
    const result = computeAutoGain({ loudnessLufs: -50, truePeakDbtp: -40, durationMs: 20_000 });
    expect(result.gainDb).toBe(15);
    expect(result.limitedBy).toBe("boost");
  });

  it("is gentler on a clip too short to measure", () => {
    const result = computeAutoGain({ loudnessLufs: -40, truePeakDbtp: -30, durationMs: 1500 });
    expect(result.gainDb).toBe(6);
    expect(result.limitedBy).toBe("short");
  });

  it("changes nothing when there is no measurement or only silence", () => {
    expect(computeAutoGain({ loudnessLufs: null, truePeakDbtp: null, durationMs: 9000 })).toEqual({
      gainDb: 0,
      limitedBy: null,
      measured: false,
    });
    expect(computeAutoGain({ loudnessLufs: -70, truePeakDbtp: -70, durationMs: 9000 }).gainDb).toBe(
      0,
    );
  });
});

describe("effectiveGain", () => {
  const measured = { loudnessLufs: -31.4, truePeakDbtp: -12, durationMs: 20_000 };

  it("follows the measurement in auto mode", () => {
    expect(effectiveGain({ gainMode: "auto", ...measured }).gainDb).toBe(7.4);
  });

  it("applies nothing at the original level", () => {
    expect(effectiveGain({ gainMode: "off", ...measured }).gainDb).toBe(0);
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
