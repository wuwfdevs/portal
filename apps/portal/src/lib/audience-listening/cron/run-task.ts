// The scheduled route's task runner, pure: each task runs on its own, one that fails is recorded and does not stop the rest, and every
// run leaves a row (when, whether it worked, counts) for a staff screen. The log is injected so this is tested without a database.

export interface TaskOutcome {
  ok: boolean;
  summary: Record<string, unknown>;
  error?: string;
}

export interface TaskLog {
  /** Records that a task began; returns its id, or null when the log itself is unavailable (the task still runs). */
  begin(task: string): Promise<string | null>;
  end(id: string | null, outcome: TaskOutcome): Promise<void>;
}

export interface Task {
  name: string;
  run(): Promise<Record<string, unknown>>;
}

const MAX_ERROR_LENGTH = 900;

/** A message safe to store: its first line, without an address, and no longer than the log keeps. */
export function describeFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .split("\n")[0]!
    .replace(/https?:\/\/\S+/g, "[address]")
    .slice(0, MAX_ERROR_LENGTH);
}

export async function runTasks(tasks: Task[], log: TaskLog): Promise<{ task: string; outcome: TaskOutcome }[]> {
  const results: { task: string; outcome: TaskOutcome }[] = [];
  for (const task of tasks) {
    let id: string | null = null;
    try {
      id = await log.begin(task.name);
    } catch {
      id = null;
    }
    let outcome: TaskOutcome;
    try {
      outcome = { ok: true, summary: await task.run() };
    } catch (error) {
      outcome = { ok: false, summary: {}, error: describeFailure(error) };
    }
    try {
      await log.end(id, outcome);
    } catch {
      // A log that cannot be written must not hide the result from the caller.
    }
    results.push({ task: task.name, outcome });
  }
  return results;
}
