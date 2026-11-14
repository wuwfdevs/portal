import { describe, expect, it, vi } from "vitest";
import { describeFailure, runTasks, type TaskLog } from "./run-task";

function log(): TaskLog & { began: string[]; ended: { id: string | null; ok: boolean }[] } {
  const began: string[] = [];
  const ended: { id: string | null; ok: boolean }[] = [];
  return {
    began,
    ended,
    begin: vi.fn(async (task: string) => {
      began.push(task);
      return `run-${began.length}`;
    }),
    end: vi.fn(async (id, outcome) => {
      ended.push({ id, ok: outcome.ok });
    }),
  };
}

describe("runTasks", () => {
  it("runs each task in order and records each one", async () => {
    const l = log();
    const results = await runTasks(
      [
        { name: "a", run: async () => ({ n: 1 }) },
        { name: "b", run: async () => ({ n: 2 }) },
      ],
      l,
    );
    expect(l.began).toEqual(["a", "b"]);
    expect(results.map((r) => [r.task, r.outcome.ok, r.outcome.summary])).toEqual([
      ["a", true, { n: 1 }],
      ["b", true, { n: 2 }],
    ]);
    expect(l.ended).toEqual([
      { id: "run-1", ok: true },
      { id: "run-2", ok: true },
    ]);
  });

  it("records a failure and goes on to the next task", async () => {
    const l = log();
    const second = vi.fn(async () => ({}));
    const results = await runTasks(
      [
        {
          name: "bad",
          run: async () => {
            throw new Error("boom\nstack line");
          },
        },
        { name: "good", run: second },
      ],
      l,
    );
    expect(results[0]!.outcome).toEqual({ ok: false, summary: {}, error: "boom" });
    expect(second).toHaveBeenCalledOnce();
    expect(l.ended.map((e) => e.ok)).toEqual([false, true]);
  });

  it("still runs a task when the log cannot be written, and still returns the result", async () => {
    const broken: TaskLog = {
      begin: async () => {
        throw new Error("db down");
      },
      end: async () => {
        throw new Error("db down");
      },
    };
    const results = await runTasks([{ name: "a", run: async () => ({ ok: 1 }) }], broken);
    expect(results[0]!.outcome.ok).toBe(true);
  });
});

describe("describeFailure", () => {
  it("keeps the first line, hides an address, and bounds the length", () => {
    expect(describeFailure(new Error("fetch https://example.org/x?token=abc failed\nmore"))).toBe("fetch [address] failed");
    expect(describeFailure("x".repeat(2000))).toHaveLength(900);
    expect(describeFailure(42)).toBe("42");
  });
});
