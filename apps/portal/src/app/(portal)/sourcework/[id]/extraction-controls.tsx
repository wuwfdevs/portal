"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BatchRunPanel } from "@/components/ui/batch-run-panel";
import { Button } from "@/components/ui/button";
import { SparklesIcon } from "@/components/ui/sparkles-icon";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { summarizeTasks } from "@/lib/task-queue";
import { useRefreshPoller } from "@/lib/use-refresh-poller";
import { useTaskQueue, type TaskResult } from "@/lib/use-task-queue";
import { progressDetail, requestAnalysis } from "@/lib/sourcework/extract-stream";
import {
  EXTRACTION_FOOTER,
  analysisSummary,
  analyzeButtonLabel,
} from "@/lib/sourcework/setup-view";

const EXTRACT_CONCURRENCY = 3;
const POLL_INTERVAL_MS = 5000;

interface AnalyzeRun {
  targetCount: number;
  canStart: boolean;
  start: () => void;
}

const AnalyzeContext = createContext<AnalyzeRun | null>(null);

/**
 * One Analyze batch for the project's Sources tab, shared by every control that starts or reports
 * it: the "next" band's button, the source list's toolbar button and the progress panel. Sources
 * that are being analyzed refresh the page on their own so the list follows along, and the
 * batch's results are shown once when it ends.
 */
export function ExtractionProvider({
  projectId,
  targets,
  anyRunning,
  children,
}: {
  projectId: string;
  /** Sources that are ready and not yet analyzed (or whose last try failed). */
  targets: { id: string; title: string }[];
  /** Whether any source's server state is "running" — drives the poll. */
  anyRunning: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const queue = useTaskQueue<string>({
    concurrency: EXTRACT_CONCURRENCY,
    worker: async (sourceId, context): Promise<TaskResult> => {
      const result = await requestAnalysis({
        projectId,
        sourceId,
        onProgress: (done, total) => context.setDetail(progressDetail(done, total)),
      });
      if (result.ok) {
        return {
          ok: true,
          detail: analysisSummary(result.added, result.clips ?? 0),
        };
      }
      return { ok: false, error: result.error, retryable: result.retryable };
    },
  });

  const summary = useMemo(() => summarizeTasks(queue.tasks), [queue.tasks]);

  useRefreshPoller({
    intervalMs: POLL_INTERVAL_MS,
    enabled: anyRunning || queue.running,
  });

  // The new data points are on the server once the batch ends; show them once.
  const refreshedFor = useRef<number>(0);
  useEffect(() => {
    if (!summary.finished) {
      refreshedFor.current = 0;
      return;
    }
    if (refreshedFor.current === summary.total) return;
    refreshedFor.current = summary.total;
    router.refresh();
  }, [summary.finished, summary.total, router]);

  const value = useMemo<AnalyzeRun>(
    () => ({
      targetCount: targets.length,
      canStart: targets.length > 0 && !queue.running,
      start: () => {
        refreshedFor.current = 0;
        queue.start(
          targets.map((target) => ({ id: target.id, label: target.title, input: target.id })),
        );
      },
    }),
    // `queue.start` is stable per hook instance; targets change with each server render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, queue.running],
  );

  return (
    <AnalyzeContext.Provider value={value}>
      <QueueContext.Provider value={{ queue, summary }}>{children}</QueueContext.Provider>
    </AnalyzeContext.Provider>
  );
}

const QueueContext = createContext<{
  queue: ReturnType<typeof useTaskQueue<string>>;
  summary: ReturnType<typeof summarizeTasks>;
} | null>(null);

function useAnalyzeRun(): AnalyzeRun {
  const value = useContext(AnalyzeContext);
  if (!value) throw new Error("AnalyzeButton must sit inside an ExtractionProvider.");
  return value;
}

/**
 * Starts the batch. `emphasis` makes it the screen's primary action (the "next" band, when Analyze
 * is the next step); otherwise it is the quiet secondary button beside "+ Add source". Renders
 * nothing when no source needs Analyze.
 */
export function AnalyzeButton({ emphasis = false }: { emphasis?: boolean }) {
  const { targetCount, canStart, start } = useAnalyzeRun();
  if (targetCount === 0) return null;
  return (
    <Button
      type="button"
      variant={emphasis ? "primary" : "secondary"}
      size={emphasis ? "md" : "sm"}
      ai
      // On a phone the toolbar's quiet Analyze is the notice's button instead (AnalyzeNotice).
      className={emphasis ? "shrink-0" : "shrink-0 max-sm:hidden"}
      disabled={!canStart}
      onClick={start}
    >
      {analyzeButtonLabel(targetCount)}
    </Button>
  );
}

/**
 * The phone's version of the toolbar's quiet Analyze button: one line above the list saying how many
 * sources are waiting, with the button on it, shown only while there is something to analyze. From
 * `sm` the toolbar's own button does this, so the notice is hidden there.
 */
export function AnalyzeNotice({ className }: { className?: string }) {
  const { targetCount, canStart, start } = useAnalyzeRun();
  if (targetCount === 0) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded bg-brand-surface py-1.5 pl-3 pr-1.5 text-sm text-ink-900 sm:hidden",
        className,
      )}
    >
      <SparklesIcon className="size-4 shrink-0 text-brand-link" />
      <span className="flex-1">{pluralize(targetCount, "source")} not analyzed</span>
      <Button type="button" variant="secondary" size="sm" ai disabled={!canStart} onClick={start}>
        Analyze
      </Button>
    </div>
  );
}

/** The running batch's progress, with stop, resume and retry; nothing until a batch has started. */
export function AnalyzeProgress() {
  const context = useContext(QueueContext);
  if (!context) throw new Error("AnalyzeProgress must sit inside an ExtractionProvider.");
  const { queue, summary } = context;
  if (queue.tasks.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      <p className="text-sm font-bold text-ink-900">Analyzing sources</p>
      <BatchRunPanel
        tasks={queue.tasks}
        running={queue.running}
        noun="sources"
        onStop={queue.stop}
        onResume={() =>
          void queue.run(queue.tasks.filter((t) => t.phase === "queued").map((t) => t.id))
        }
        onRetry={(id) => queue.retry([id])}
        onRetryFailed={() =>
          queue.retry(queue.tasks.filter((t) => t.phase === "failed").map((t) => t.id))
        }
      />
      <p className="text-xs text-ink-400">{EXTRACTION_FOOTER}</p>
      {summary.finished && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={queue.reset}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
