// Display formatters shared across tools. Pure and dependency-free, so client
// components can import them. Domain-specific formatters (station time in
// lib/log/timezone.ts, dollars on a rate card in lib/bookings/rates.ts) stay
// with their domain; the generic ones live here.

const UNITS = ["KB", "MB", "GB"];

/** "812 B", "4.2 MB", "120 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${UNITS[unitIndex]}`;
}

/** m:ss for under an hour, h:mm:ss beyond that. Negative input reads as zero. */
export function formatClock(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/** {@link formatClock} for a duration in milliseconds. */
export function formatClockMs(durationMs: number): string {
  return formatClock(durationMs / 1000);
}

/** "Oct 7" — or "Oct 7, 2026" with `year: true`. */
export function formatShortDate(value: string | Date, options: { year?: boolean } = {}): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(options.year ? { year: "numeric" } : {}),
  });
}

/** "Oct 7, 3:05 PM" in the viewer's timezone (an activity log's timestamp). */
export function formatShortDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Whole dollars: "$1,150". For cents, use lib/bookings/rates.ts's formatDollars. */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
