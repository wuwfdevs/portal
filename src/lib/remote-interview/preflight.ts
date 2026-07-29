// Pure, dependency-free preflight logic: turns raw browser signals (device
// availability, permission outcome, a measured level, storage headroom, a
// user-agent string, connection info) into the warning list the guest and
// host both see. Kept separate from the browser-API calls that gather those
// signals (src/app/join/[token]/preflight.tsx) so the actual decision logic
// is testable under Vitest without mocking getUserMedia/MediaRecorder/OPFS —
// per CLAUDE.md's testing expectations, the same pattern as tokens.ts.
//
// See docs/remote-interview-design.md §3B for the warning list this
// implements: "no microphone detected; permission blocked; a selected device
// producing no signal; an unsupported browser; ... insufficient local
// storage for the expected session length; a browser likely to suspend
// recording; a network too unstable for a workable conversation; and mobile
// configurations likely to interrupt recording."
//
// Every warning here is advisory, never gating: "a guest can proceed past a
// warning ... but never without seeing it" (design doc §3B). Severity only
// changes how loud a warning reads, not whether Continue is enabled.

export type PreflightWarningCode =
  | "unsupported_browser"
  | "permission_blocked"
  | "no_microphone"
  | "no_signal"
  | "insufficient_storage"
  | "mobile_suspend_risk"
  | "unstable_network";

export type PreflightWarningSeverity = "blocking" | "caution";

export interface PreflightWarning {
  code: PreflightWarningCode;
  severity: PreflightWarningSeverity;
  message: string;
}

const WARNING_TEXT: Record<PreflightWarningCode, { severity: PreflightWarningSeverity; message: string }> = {
  unsupported_browser: {
    severity: "blocking",
    message:
      "This browser can't record audio reliably here. Use a recent Chrome, Edge, Firefox, or Safari.",
  },
  permission_blocked: {
    severity: "blocking",
    message: "Microphone access is blocked. Allow it in your browser's site settings and reload.",
  },
  no_microphone: {
    severity: "blocking",
    message: "No microphone was detected on this device.",
  },
  no_signal: {
    severity: "caution",
    message: "The selected microphone doesn't seem to be picking up any sound. Check it's the right device.",
  },
  insufficient_storage: {
    severity: "caution",
    message:
      "This device may not have enough free storage for a full recording. Free up space or expect an interruption.",
  },
  mobile_suspend_risk: {
    severity: "caution",
    message:
      "On a phone or tablet, recording can be interrupted if the screen locks or the browser goes to the background. Keep this tab open and in the foreground throughout.",
  },
  unstable_network: {
    severity: "caution",
    message:
      "Your connection looks unstable. The call may stutter — your recording is unaffected as long as this tab stays open.",
  },
};

function makeWarning(code: PreflightWarningCode): PreflightWarning {
  return { code, ...WARNING_TEXT[code] };
}

/** 16-bit PCM mono at 48kHz — the local-master format (design doc §6). */
const MASTER_BYTES_PER_SECOND = 48_000 * 2;

/** No per-session planned duration is captured yet; a flat, conservative default budget. */
export const EXPECTED_SESSION_MINUTES = 60;

export function estimateSessionBytes(minutes: number = EXPECTED_SESSION_MINUTES): number {
  return Math.round(minutes * 60 * MASTER_BYTES_PER_SECOND);
}

/** Heuristic only — there's no reliable feature-detection for "this is a phone." */
export function isLikelyMobileUserAgent(userAgent: string): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
}

export interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/** Best-effort only: the Network Information API is Chromium-only and this tool has no call layer yet to measure against directly. */
export function isConnectionUnstable(connection: ConnectionInfo | null | undefined): boolean {
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g" || connection.effectiveType === "3g";
}

export interface StorageEstimate {
  quotaBytes: number | null;
  usageBytes: number | null;
}

/** Null when the estimate API itself is unavailable — that's "can't verify," not a warning to fabricate. */
export function hasInsufficientStorage(
  estimate: StorageEstimate,
  expectedBytes: number = estimateSessionBytes(),
): boolean | null {
  if (estimate.quotaBytes === null || estimate.usageBytes === null) return null;
  return estimate.quotaBytes - estimate.usageBytes < expectedBytes;
}

export interface PreflightSignals {
  browserSupported: boolean;
  permissionState: "granted" | "denied" | "unknown";
  micDevicesDetected: boolean;
  /** null = not yet measured (e.g. permission not granted yet). */
  signalDetected: boolean | null;
  storage: StorageEstimate;
  userAgent: string;
  connection: ConnectionInfo | null;
}

/**
 * The single status-derivation function everything else feeds. Order is
 * blocking-first so the UI can lead with what actually stops a recording
 * from happening at all.
 */
export function derivePreflightWarnings(signals: PreflightSignals): PreflightWarning[] {
  const warnings: PreflightWarning[] = [];

  if (!signals.browserSupported) warnings.push(makeWarning("unsupported_browser"));
  if (signals.permissionState === "denied") warnings.push(makeWarning("permission_blocked"));
  else if (!signals.micDevicesDetected) warnings.push(makeWarning("no_microphone"));
  else if (signals.signalDetected === false) warnings.push(makeWarning("no_signal"));

  if (hasInsufficientStorage(signals.storage) === true) warnings.push(makeWarning("insufficient_storage"));
  if (isLikelyMobileUserAgent(signals.userAgent)) warnings.push(makeWarning("mobile_suspend_risk"));
  if (isConnectionUnstable(signals.connection)) warnings.push(makeWarning("unstable_network"));

  return warnings;
}
