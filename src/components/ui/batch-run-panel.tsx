"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatBytes } from "@/lib/format";
import { foldTasks, summarizeTasks, type QueueTask } from "@/lib/task-queue";

/**
 * The panel for a run of many tasks (a batch of uploads): one overall bar,
 * then only what needs a look. Failures are pinned first with their reason
 * and a Retry, running tasks show their own progress, the next few queued
 * are named, and everything else folds into a count ("24 waiting", "12
 * done") so forty files read like three. State comes from `useTaskQueue`.
 */
export function BatchRunPanel({
  tasks,
  running,
  noun = "files",
  onStop,
  onResume,
  onRetry,
  onRetryFailed,
}: {
  tasks: QueueTask[];
  running: boolean;
  /** What the tasks are, plural, for the summary line. */
  noun?: string;
  onStop: () => void;
  onResume: () => void;
  onRetry: (id: string) => void;
  onRetryFailed: () => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const summary = summarizeTasks(tasks);
  const folded = foldTasks(tasks, { showDone });

  return (
    <div aria-live="polite" className="flex flex-col gap-3 rounded border border-line px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-ink-900">
          {summary.done} of {summary.total} {noun} done
        </span>
        <span className="text-[13px] text-ink-500">
          {[
            summary.running > 0 && `${summary.running} in progress`,
            summary.failed > 0 &&
              `${summary.failed} need${summary.failed === 1 ? "s" : ""} attention`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <ProgressBar
        done={summary.percent}
        total={100}
        label={`Progress of ${summary.total} ${noun}`}
        valueText={`${summary.done} of ${summary.total} ${noun} done`}
        complete={summary.finished && summary.failed === 0}
      />

      <ul className="flex flex-col gap-2">
        {folded.visible.map((task) => (
          <TaskRow key={task.id} task={task} running={running} onRetry={() => onRetry(task.id)} />
        ))}
      </ul>

      {(folded.hiddenQueued > 0 || folded.hiddenDone > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-500">
          {folded.hiddenQueued > 0 && <span>{folded.hiddenQueued} waiting</span>}
          {folded.hiddenDone > 0 && (
            <button
              type="button"
              onClick={() => setShowDone(true)}
              className="font-semibold text-brand-link"
            >
              {folded.hiddenDone} done · show
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {running && (
          <Button type="button" variant="secondary" size="sm" onClick={onStop}>
            Stop after the current {summary.running === 1 ? "file" : "files"}
          </Button>
        )}
        {!running && summary.queued > 0 && (
          <Button type="button" size="sm" onClick={onResume}>
            Resume ({summary.queued} left)
          </Button>
        )}
        {!running && summary.failed > 1 && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetryFailed}>
            Retry all {summary.failed} that failed
          </Button>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  running,
  onRetry,
}: {
  task: QueueTask;
  running: boolean;
  onRetry: () => void;
}) {
  const failed = task.phase === "failed";
  return (
    <li
      className={
        failed
          ? "flex flex-col gap-1 rounded border border-danger/30 bg-danger/[0.06] px-3 py-2"
          : "flex flex-col gap-1"
      }
    >
      <div className="flex items-baseline gap-3 text-sm">
        <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">{task.label}</span>
        {task.sizeBytes !== null && (
          <span className="shrink-0 text-xs text-ink-500">{formatBytes(task.sizeBytes)}</span>
        )}
        <span className="shrink-0 text-xs text-ink-500">
          {task.phase === "running" && task.progress !== null
            ? `${Math.round(task.progress * 100)}%`
            : task.phase === "queued"
              ? (task.detail ?? "Waiting")
              : task.phase === "done"
                ? (task.detail ?? "Done")
                : ""}
        </span>
      </div>
      {task.phase === "running" &&
        (task.progress !== null && task.progress > 0 && task.progress < 1 ? (
          <ProgressBar
            size="sm"
            done={Math.round(task.progress * 100)}
            total={100}
            label={`Uploading ${task.label}`}
          />
        ) : (
          <ProgressBar indeterminate size="sm" label={`Working on ${task.label}`} />
        ))}
      {task.phase === "running" && task.detail && (
        <span className="text-xs text-ink-500">{task.detail}</span>
      )}
      {failed && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-danger">{task.error}</span>
          {!running && (
            <button type="button" onClick={onRetry} className="font-semibold text-brand-link">
              Retry
            </button>
          )}
        </div>
      )}
    </li>
  );
}
