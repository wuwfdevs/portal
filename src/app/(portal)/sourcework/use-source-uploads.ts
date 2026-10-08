"use client";

import { useCallback, useRef } from "react";
import { useTaskQueue, type TaskResult } from "@/lib/use-task-queue";
import { uploadSource, type SourceUploadActions } from "@/lib/transcription/upload-source";

/** A file chosen for upload, with the title it will get. */
export interface StagedFile {
  key: string;
  file: File;
  title: string;
}

/** How many files upload at once. Each is one long request; three keeps a slow connection moving without starving the first. */
export const UPLOAD_CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;

/**
 * Uploads staged files as sources, a few at a time, with progress and
 * retries. The caller supplies the server half (`actions`) when it starts a
 * run, because a new project doesn't exist until its form is submitted.
 * A retry reuses the source row an interrupted attempt already created.
 */
export function useSourceUploads() {
  const actionsRef = useRef<SourceUploadActions | null>(null);
  const sourceIdByTask = useRef(new Map<string, string>());

  const queue = useTaskQueue<StagedFile>({
    concurrency: UPLOAD_CONCURRENCY,
    maxAttempts: MAX_ATTEMPTS,
    worker: async (staged, context): Promise<TaskResult> => {
      const actions = actionsRef.current;
      if (!actions) return { ok: false, error: "The upload was not set up." };

      const result = await uploadSource({
        file: staged.file,
        title: staged.title,
        actions,
        existingSourceId: sourceIdByTask.current.get(staged.key) ?? null,
        finalAttempt: context.attempt >= MAX_ATTEMPTS,
        onProgress: context.setProgress,
        onStage: (stage) =>
          context.setDetail(
            stage === "creating"
              ? "Creating the source"
              : stage === "finishing"
                ? "Finishing up"
                : null,
          ),
      });

      if (result.sourceId) sourceIdByTask.current.set(staged.key, result.sourceId);
      if (!result.ok) {
        return { ok: false, error: result.error, retryable: result.retryable };
      }
      return {
        ok: true,
        detail: result.processingError
          ? "Uploaded; processing didn't start. Retry it from the project."
          : "Uploaded",
      };
    },
  });

  const begin = useCallback(
    (staged: StagedFile[], actions: SourceUploadActions) => {
      actionsRef.current = actions;
      sourceIdByTask.current = new Map();
      queue.start(
        staged.map((item) => ({
          id: item.key,
          label: item.title || item.file.name,
          sizeBytes: item.file.size,
          input: item,
        })),
      );
    },
    [queue],
  );

  /** Source ids created so far for tasks that finished. */
  const uploadedSourceIds = useCallback(
    () =>
      queue.tasks
        .filter((task) => task.phase === "done")
        .map((task) => sourceIdByTask.current.get(task.id))
        .filter((id): id is string => Boolean(id)),
    [queue.tasks],
  );

  const retryFailed = useCallback(
    () => queue.retry(queue.tasks.filter((task) => task.phase === "failed").map((task) => task.id)),
    [queue],
  );

  const resume = useCallback(
    () => queue.run(queue.tasks.filter((task) => task.phase === "queued").map((task) => task.id)),
    [queue],
  );

  return { ...queue, begin, uploadedSourceIds, retryFailed, resume };
}
