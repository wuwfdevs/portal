"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BatchRunPanel } from "@/components/ui/batch-run-panel";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { pluralize } from "@/lib/format";
import { summarizeTasks } from "@/lib/task-queue";
import { useRefreshPoller } from "@/lib/use-refresh-poller";
import { useTaskQueue, type TaskResult } from "@/lib/use-task-queue";
import { progressDetail, requestExtraction } from "@/lib/sourcework/extract-stream";
import { EXTRACTION_FOOTER, extractButtonLabel } from "@/lib/sourcework/setup-view";

const EXTRACT_CONCURRENCY = 3;
const POLL_INTERVAL_MS = 5000;

/**
 * The Sources tab's header for a project that has research questions: the
 * "Sources" label with "Extract data points" beside "+ Add source" (passed as
 * children), and, while a batch runs, its progress panel. Sources that are
 * extracting refresh the page on their own so the cards follow along.
 */
export function ExtractionControls({
  projectId,
  targets,
  anyRunning,
  children,
}: {
  projectId: string;
  /** Sources that are ready and not yet extracted (or whose last try failed). */
  targets: { id: string; title: string }[];
  /** Whether any source's server state is "running" — drives the poll. */
  anyRunning: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const queue = useTaskQueue<string>({
    concurrency: EXTRACT_CONCURRENCY,
    worker: async (sourceId, context): Promise<TaskResult> => {
      const result = await requestExtraction({
        projectId,
        sourceId,
        onProgress: (done, total) => context.setDetail(progressDetail(done, total)),
      });
      if (result.ok) {
        return {
          ok: true,
          detail:
            result.added === 0
              ? "No new data points"
              : `${pluralize(result.added, "data point")} added`,
        };
      }
      return { ok: false, error: result.error, retryable: result.retryable };
    },
  });

  const summary = useMemo(() => summarizeTasks(queue.tasks), [queue.tasks]);
  const started = queue.tasks.length > 0;

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

  function start() {
    refreshedFor.current = 0;
    queue.start(
      targets.map((target) => ({ id: target.id, label: target.title, input: target.id })),
    );
  }

  const canStart = targets.length > 0 && !queue.running;

  return (
    <>
      <SectionHeading
        level="eyebrow"
        className="mb-3 items-center"
        action={
          <div className="flex items-center gap-2">
            {targets.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 max-lg:min-h-11"
                disabled={!canStart}
                onClick={start}
              >
                {extractButtonLabel(targets.length)}
              </Button>
            )}
            {children}
          </div>
        }
      >
        Sources
      </SectionHeading>

      {started && (
        <div className="mb-4 flex flex-col gap-2">
          <p className="text-sm font-bold text-ink-900">Extracting data points</p>
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
              className="self-start max-lg:min-h-11"
              onClick={queue.reset}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </>
  );
}
