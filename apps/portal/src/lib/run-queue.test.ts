import { describe, expect, it } from "vitest";
import { runQueue, type QueueOutcome } from "./run-queue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("runQueue", () => {
  it("runs at most `concurrency` at once, in order", async () => {
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    await runQueue(
      [1, 2, 3, 4, 5, 6, 7],
      async (item) => {
        started.push(item);
        running += 1;
        peak = Math.max(peak, running);
        await tick();
        running -= 1;
        return { kind: "done" };
      },
      { concurrency: 3, isStopped: () => false },
    );
    expect(peak).toBe(3);
    expect(started).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("puts a rate-limited entry back first, pauses, and runs one fewer at a time", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const calls: string[] = [];
    let running = 0;
    let peakAfterRetry = 0;
    let retried = false;
    await runQueue(
      ["a", "b", "c", "d", "e"],
      async (item, attempt): Promise<QueueOutcome> => {
        calls.push(`${item}${attempt}`);
        running += 1;
        if (retried) peakAfterRetry = Math.max(peakAfterRetry, running);
        await tick();
        running -= 1;
        if (item === "a" && attempt === 1) {
          retried = true;
          return { kind: "retry", afterMs: 5000 };
        }
        return { kind: "done" };
      },
      {
        concurrency: 3,
        isStopped: () => false,
        now: () => clock,
        sleep: async (ms) => {
          sleeps.push(ms);
          clock += ms;
          await tick();
        },
      },
    );
    expect(calls).toContain("a2");
    expect(calls.filter((call) => call.startsWith("a"))).toEqual(["a1", "a2"]);
    expect(sleeps[0]).toBe(5000);
    expect(peakAfterRetry).toBeLessThanOrEqual(2);
    expect(calls).toHaveLength(6);
  });

  it("starts nothing more after a stop, and reports what's left", async () => {
    let stopped = false;
    const gate = deferred();
    const run = runQueue(
      [1, 2, 3, 4],
      async (item) => {
        if (item === 1) {
          stopped = true;
          await gate.promise;
        }
        return { kind: "done" };
      },
      { concurrency: 1, isStopped: () => stopped },
    );
    gate.resolve();
    await expect(run).resolves.toEqual({ unfinished: [2, 3, 4] });
  });

  it("does nothing with an empty list", async () => {
    await expect(
      runQueue([], async () => ({ kind: "done" }), { concurrency: 3, isStopped: () => false }),
    ).resolves.toEqual({ unfinished: [] });
  });
});
