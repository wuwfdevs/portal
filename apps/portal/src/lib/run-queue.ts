// A small work queue for the browser or the server: run `worker` over a list,
// a few at a time, in order, and when a worker reports a retry (a provider's
// rate limit, a dropped connection) put that item back at the front, pause
// new launches for the suggested wait, and run one fewer at a time for the
// rest of the run. It began as the legacy-agreement migration's run
// (docs/underwriting-traffic-redesign.md §14.5), where each item is a model
// call of a minute or two against a shared token cap; it is generic, so
// Sourcework's multi-file upload uses it too. Pure apart from the injected
// clock and sleep, so it's tested without a network.

export type QueueOutcome = { kind: "done" } | { kind: "retry"; afterMs: number };

export interface QueueOptions {
  concurrency: number;
  /** Checked before each launch: a stop lets running entries finish and starts no more. */
  isStopped: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `worker` over `items`, at most `concurrency` at a time, in order.
 * `attempt` starts at 1 and counts the entry's own retries. Returns the
 * entries never started (a stop) so the screen can say what's left.
 */
export async function runQueue<T>(
  items: T[],
  worker: (item: T, attempt: number) => Promise<QueueOutcome>,
  options: QueueOptions,
): Promise<{ unfinished: T[] }> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const queue = items.map((item) => ({ item, attempt: 1 }));
  let limit = Math.max(1, Math.floor(options.concurrency));
  let resumeAt = 0;

  async function slot(index: number): Promise<void> {
    while (index < limit && !options.isStopped()) {
      const wait = resumeAt - now();
      if (wait > 0) {
        await sleep(wait);
        continue;
      }
      const next = queue.shift();
      if (!next) return;
      const outcome = await worker(next.item, next.attempt);
      if (outcome.kind === "retry") {
        queue.unshift({ item: next.item, attempt: next.attempt + 1 });
        resumeAt = Math.max(resumeAt, now() + Math.max(0, outcome.afterMs));
        limit = Math.max(1, limit - 1);
      }
    }
  }

  // A slot that finds the queue empty ends; a retry from a slot still
  // running can refill it afterwards, so go round again until it's drained.
  while (queue.length > 0 && !options.isStopped()) {
    await Promise.all(Array.from({ length: limit }, (_, index) => slot(index)));
  }
  return { unfinished: queue.map((entry) => entry.item) };
}
