/**
 * The wait an OpenAI rate-limit message suggests — "Please try again in
 * 1.52s", "in 820ms", "in 1m3.5s" — in milliseconds, or null when the
 * message carries no hint. Pure, so the migration's queue (and its tests)
 * can use it without the SDK; openai-error.ts decides whether an error is a
 * rate limit at all.
 */
export function parseRetryAfterMs(message: string): number | null {
  const hint = /try again in\s+((?:\d+(?:\.\d+)?\s*(?:ms|h|m|s)\s*)+)/i.exec(message)?.[1];
  if (!hint) return null;
  let total = 0;
  for (const match of hint.matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|m|s)/gi)) {
    const value = Number.parseFloat(match[1]!);
    const unit = match[2]!.toLowerCase();
    total +=
      unit === "ms"
        ? value
        : unit === "s"
          ? value * 1000
          : unit === "m"
            ? value * 60_000
            : value * 3_600_000;
  }
  return Math.ceil(total);
}
