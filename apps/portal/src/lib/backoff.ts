/**
 * The wait before retry number `attempt` (1-based) after a failure: `baseMs`,
 * doubling each time, never more than `capMs`. One place for the doubling so
 * the browser queues that retry over a flaky connection (On Air's offline
 * queue, Remote Interview's part uploads, Sourcework's file uploads) agree on
 * what "exponential backoff" means; each keeps its own base and cap.
 */
export function backoffDelayMs(
  attempt: number,
  { baseMs, capMs }: { baseMs: number; capMs: number },
): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(capMs, baseMs * 2 ** exponent);
}
