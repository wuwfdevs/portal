"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runQueue, type QueueOutcome } from "@/lib/run-queue";
import { backoffDelayMs } from "@/lib/backoff";
import { newTask, patchTask, type QueueTask } from "@/lib/task-queue";

export type TaskResult =
  | { ok: true; detail?: string }
  /** `retryable` puts the task back for another try, with backoff, until `maxAttempts` is used. */
  | { ok: false; error: string; retryable?: boolean };

export interface TaskContext {
  /** 1 for the first try. */
  attempt: number;
  setProgress: (fraction: number | null) => void;
  setDetail: (detail: string | null) => void;
}

export interface TaskItem<TInput> {
  id: string;
  label: string;
  sizeBytes?: number | null;
  input: TInput;
}

const RETRY_BACKOFF = { baseMs: 2_000, capMs: 30_000 };

/**
 * Runs a batch of tasks (file uploads, say) a few at a time and keeps the
 * list `BatchRunPanel` draws. Scheduling is the shared `runQueue`; a
 * retryable failure goes back in the queue after a backoff, and a stop lets
 * running tasks finish and leaves the rest queued to resume.
 */
export function useTaskQueue<TInput>({
  concurrency,
  maxAttempts = 3,
  worker,
}: {
  concurrency: number;
  maxAttempts?: number;
  worker: (input: TInput, context: TaskContext) => Promise<TaskResult>;
}) {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [running, setRunning] = useState(false);
  const inputs = useRef(new Map<string, TInput>());
  const stopRef = useRef(false);
  const workerRef = useRef(worker);
  useEffect(() => {
    workerRef.current = worker;
  }, [worker]);

  const patch = useCallback((id: string, change: Partial<QueueTask>) => {
    setTasks((current) => patchTask(current, id, change));
  }, []);

  const run = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      stopRef.current = false;
      setRunning(true);
      await runQueue(
        ids,
        async (id, attempt): Promise<QueueOutcome> => {
          const input = inputs.current.get(id) as TInput;
          patch(id, { phase: "running", attempt, progress: 0, error: null, detail: null });
          let result: TaskResult;
          try {
            result = await workerRef.current(input, {
              attempt,
              setProgress: (progress) => patch(id, { progress }),
              setDetail: (detail) => patch(id, { detail }),
            });
          } catch (error) {
            result = {
              ok: false,
              error: error instanceof Error ? error.message : "Something went wrong.",
            };
          }
          if (result.ok) {
            patch(id, { phase: "done", progress: 1, detail: result.detail ?? null });
            return { kind: "done" };
          }
          if (result.retryable && attempt < maxAttempts) {
            patch(id, {
              phase: "queued",
              progress: null,
              detail: "Retrying after an interruption",
            });
            return { kind: "retry", afterMs: backoffDelayMs(attempt, RETRY_BACKOFF) };
          }
          patch(id, { phase: "failed", progress: null, error: result.error, detail: null });
          return { kind: "done" };
        },
        { concurrency, isStopped: () => stopRef.current },
      );
      setRunning(false);
    },
    [concurrency, maxAttempts, patch],
  );

  /** Replaces the list with these tasks and starts them. */
  const start = useCallback(
    (items: TaskItem<TInput>[]) => {
      inputs.current = new Map(items.map((item) => [item.id, item.input]));
      setTasks(items.map((item) => newTask(item.id, item.label, item.sizeBytes ?? null)));
      void run(items.map((item) => item.id));
    },
    [run],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const retry = useCallback(
    (ids: string[]) => {
      setTasks((current) =>
        current.map((task) =>
          ids.includes(task.id) ? { ...task, phase: "queued", error: null, progress: null } : task,
        ),
      );
      void run(ids);
    },
    [run],
  );

  const reset = useCallback(() => {
    inputs.current = new Map();
    setTasks([]);
  }, []);

  return { tasks, running, start, stop, retry, reset, run };
}
