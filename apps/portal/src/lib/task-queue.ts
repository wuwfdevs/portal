/**
 * State for a batch run: a list of tasks (files uploading, entries being
 * read), each queued, running, done or failed. Pure helpers, so the screen's
 * rules (failures first, the tail folded, one overall figure) are tested
 * without a browser. `useTaskQueue` holds the state; `BatchRunPanel` draws it.
 */
export type TaskPhase = "queued" | "running" | "done" | "failed";

export interface QueueTask {
  id: string;
  label: string;
  sizeBytes: number | null;
  phase: TaskPhase;
  /** 0 to 1 while running and measurable; null when the task has no honest figure. */
  progress: number | null;
  /** A few words after the label: "Retrying", "Extracting text". */
  detail: string | null;
  error: string | null;
  /** 1 for the first try. */
  attempt: number;
}

export function newTask(id: string, label: string, sizeBytes: number | null = null): QueueTask {
  return {
    id,
    label,
    sizeBytes,
    phase: "queued",
    progress: null,
    detail: null,
    error: null,
    attempt: 1,
  };
}

export function patchTask(tasks: QueueTask[], id: string, patch: Partial<QueueTask>): QueueTask[] {
  return tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
}

export interface TaskSummary {
  total: number;
  done: number;
  failed: number;
  running: number;
  queued: number;
  /** Done plus the running tasks' partial progress, as a share of the total, 0 to 100. */
  percent: number;
  /** Nothing left to run: every task is done or failed. */
  finished: boolean;
}

export function summarizeTasks(tasks: QueueTask[]): TaskSummary {
  const count = (phase: TaskPhase) => tasks.filter((task) => task.phase === phase).length;
  const done = count("done");
  const failed = count("failed");
  const running = count("running");
  const queued = count("queued");
  const partial = tasks
    .filter((task) => task.phase === "running")
    .reduce((sum, task) => sum + (task.progress ?? 0), 0);
  const total = tasks.length;
  return {
    total,
    done,
    failed,
    running,
    queued,
    percent: total === 0 ? 0 : Math.min(100, Math.round(((done + partial) / total) * 100)),
    finished: total > 0 && queued === 0 && running === 0,
  };
}

export interface FoldedTasks {
  /** Failures first, then running, then the next few queued. */
  visible: QueueTask[];
  hiddenQueued: number;
  hiddenDone: number;
}

/**
 * What a run panel draws. Problems and live work are always shown; finished
 * tasks fold into a count, and only the next few queued ones are listed, so
 * a 40-file run is as readable as a 3-file one.
 */
export function foldTasks(
  tasks: QueueTask[],
  options: { queuedVisible?: number; showDone?: boolean } = {},
): FoldedTasks {
  const { queuedVisible = 3, showDone = false } = options;
  const failed = tasks.filter((task) => task.phase === "failed");
  const running = tasks.filter((task) => task.phase === "running");
  const queued = tasks.filter((task) => task.phase === "queued");
  const done = tasks.filter((task) => task.phase === "done");
  return {
    visible: [...failed, ...running, ...queued.slice(0, queuedVisible), ...(showDone ? done : [])],
    hiddenQueued: Math.max(0, queued.length - queuedVisible),
    hiddenDone: showDone ? 0 : done.length,
  };
}
