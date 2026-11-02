import { describe, expect, it } from "vitest";
import {
  derivePreflightWarnings,
  estimateSessionBytes,
  hasInsufficientStorage,
  isConnectionUnstable,
  isLikelyMobileUserAgent,
  type PreflightSignals,
} from "./preflight";

const BASE_SIGNALS: PreflightSignals = {
  browserSupported: true,
  permissionState: "granted",
  micDevicesDetected: true,
  signalDetected: true,
  storage: { quotaBytes: 10_000_000_000, usageBytes: 0 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0",
  connection: null,
};

describe("estimateSessionBytes", () => {
  it("is 48kHz/16-bit mono for the given minutes", () => {
    expect(estimateSessionBytes(1)).toBe(60 * 48_000 * 2);
  });

  it("defaults to a one-hour budget", () => {
    expect(estimateSessionBytes()).toBe(60 * 60 * 48_000 * 2);
  });
});

describe("isLikelyMobileUserAgent", () => {
  it("flags common mobile user agents", () => {
    expect(isLikelyMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isLikelyMobileUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(true);
  });

  it("does not flag an ordinary desktop user agent", () => {
    expect(isLikelyMobileUserAgent(BASE_SIGNALS.userAgent)).toBe(false);
  });
});

describe("isConnectionUnstable", () => {
  it("is false with no connection info at all", () => {
    expect(isConnectionUnstable(null)).toBe(false);
  });

  it("flags save-data mode regardless of effectiveType", () => {
    expect(isConnectionUnstable({ saveData: true, effectiveType: "4g" })).toBe(true);
  });

  it("flags slow effective types", () => {
    expect(isConnectionUnstable({ effectiveType: "2g" })).toBe(true);
    expect(isConnectionUnstable({ effectiveType: "3g" })).toBe(true);
  });

  it("does not flag a healthy connection", () => {
    expect(isConnectionUnstable({ effectiveType: "4g" })).toBe(false);
  });
});

describe("hasInsufficientStorage", () => {
  it("is null when the estimate API itself is unavailable", () => {
    expect(hasInsufficientStorage({ quotaBytes: null, usageBytes: null })).toBeNull();
  });

  it("is true when free space is under the expected budget", () => {
    expect(
      hasInsufficientStorage({ quotaBytes: 100_000_000, usageBytes: 0 }, 345_000_000),
    ).toBe(true);
  });

  it("is false with plenty of headroom", () => {
    expect(
      hasInsufficientStorage({ quotaBytes: 10_000_000_000, usageBytes: 0 }, 345_000_000),
    ).toBe(false);
  });
});

describe("derivePreflightWarnings", () => {
  it("produces no warnings for a clean signal set", () => {
    expect(derivePreflightWarnings(BASE_SIGNALS)).toEqual([]);
  });

  it("leads with unsupported_browser when the browser can't support recording at all", () => {
    const warnings = derivePreflightWarnings({ ...BASE_SIGNALS, browserSupported: false });
    expect(warnings[0]?.code).toBe("unsupported_browser");
    expect(warnings[0]?.severity).toBe("blocking");
  });

  it("reports permission_blocked over no_microphone when permission was actually denied", () => {
    const warnings = derivePreflightWarnings({
      ...BASE_SIGNALS,
      permissionState: "denied",
      micDevicesDetected: false,
    });
    expect(warnings.map((w) => w.code)).toEqual(["permission_blocked"]);
  });

  it("reports no_microphone when permission is fine but no device was found", () => {
    const warnings = derivePreflightWarnings({
      ...BASE_SIGNALS,
      micDevicesDetected: false,
    });
    expect(warnings.map((w) => w.code)).toEqual(["no_microphone"]);
  });

  it("reports no_signal only once a device is selected and produces nothing", () => {
    const warnings = derivePreflightWarnings({ ...BASE_SIGNALS, signalDetected: false });
    expect(warnings.map((w) => w.code)).toEqual(["no_signal"]);
  });

  it("does not report no_signal while it hasn't been measured yet", () => {
    const warnings = derivePreflightWarnings({ ...BASE_SIGNALS, signalDetected: null });
    expect(warnings.map((w) => w.code)).not.toContain("no_signal");
  });

  it("accumulates every applicable caution alongside a blocking warning", () => {
    const warnings = derivePreflightWarnings({
      ...BASE_SIGNALS,
      storage: { quotaBytes: 1_000_000, usageBytes: 0 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      connection: { effectiveType: "2g" },
      micDevicesDetected: false,
    });
    expect(warnings.map((w) => w.code)).toEqual([
      "no_microphone",
      "insufficient_storage",
      "mobile_suspend_risk",
      "unstable_network",
    ]);
  });
});
