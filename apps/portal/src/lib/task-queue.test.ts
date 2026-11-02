import { describe, expect, it } from "vitest";
import { foldTasks, newTask, patchTask, summarizeTasks, type QueueTask } from "./task-queue";

function tasks(phases: QueueTask["phase"][]): QueueTask[] {
  return phases.map((phase, index) => ({ ...newTask(`t${index}`, `File ${index}`), phase }));
}

describe("summarizeTasks", () => {
  it("counts each phase and reports finished only when nothing is left", () => {
    const s = summarizeTasks(tasks(["done", "failed", "running", "queued"]));
    expect(s).toMatchObject({
      total: 4,
      done: 1,
      failed: 1,
      running: 1,
      queued: 1,
      finished: false,
    });
    expect(summarizeTasks(tasks(["done", "failed"])).finished).toBe(true);
    expect(summarizeTasks([]).finished).toBe(false);
  });

  it("counts a running task's partial progress toward the overall figure", () => {
    const list = patchTask(tasks(["done", "running", "queued", "queued"]), "t1", { progress: 0.5 });
    expect(summarizeTasks(list).percent).toBe(38);
  });
});

describe("foldTasks", () => {
  it("lists failures, then running, then the next few queued, and folds the rest", () => {
    const list = tasks([
      "done",
      "queued",
      "queued",
      "queued",
      "queued",
      "queued",
      "running",
      "failed",
    ]);
    const folded = foldTasks(list, { queuedVisible: 2 });
    expect(folded.visible.map((t) => t.phase)).toEqual(["failed", "running", "queued", "queued"]);
    expect(folded.hiddenQueued).toBe(3);
    expect(folded.hiddenDone).toBe(1);
  });

  it("can show the finished ones too", () => {
    const folded = foldTasks(tasks(["done", "done"]), { showDone: true });
    expect(folded.visible).toHaveLength(2);
    expect(folded.hiddenDone).toBe(0);
  });
});
