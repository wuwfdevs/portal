"use client";

import { useEffect, useMemo, useState } from "react";
import { BatchRunPanel } from "@/components/ui/batch-run-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/format";
import { summarizeTasks } from "@/lib/task-queue";
import { SOURCE_KIND_LABEL } from "@/lib/transcription/status";
import { formatDuration } from "@/lib/transcription/media";
import type { SourceUploadActions } from "@/lib/transcription/upload-source";
import { StagedFiles } from "../staged-files";
import { useSourceUploads, type StagedFile } from "../use-source-uploads";
import {
  listAttachableSources,
  attachSourceToProject,
  createSourceForProject,
  completeSourceUpload,
  failSourceUpload,
  type AttachableSource,
} from "./source-actions";

type Mode = "find" | "upload";

/**
 * Single entry point for adding a source to a project — a "Find existing" /
 * "Upload new" toggle inside one modal, rather than two separate buttons the
 * reporter has to pick between up front. `onDone(sourceId)` fires on success
 * from either mode; the caller switches the project's active source to it
 * regardless of which mode produced it (docs/sourcework-design.md §7.4's "no
 * confirmation step" reasoning applies the same way to both — neither risks
 * RLS or data loss).
 */
export function AddSourceModal({
  projectId,
  hasSources,
  onClose,
  onDone,
}: {
  projectId: string;
  /** False for a project with nothing in it yet: the dialog opens on Upload, since there is little to find. */
  hasSources: boolean;
  onClose: () => void;
  onDone: (sourceId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(hasSources ? "find" : "upload");

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100vh-6rem)] w-full max-w-xl overflow-y-auto rounded border border-line bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-900">Add a source</p>
          <Button
            type="button"
            variant="link"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700"
          >
            Close
          </Button>
        </div>

        <div className="mb-3 flex gap-1.5">
          <ModeTab label="Find existing" active={mode === "find"} onClick={() => setMode("find")} />
          <ModeTab
            label="Upload new"
            active={mode === "upload"}
            onClick={() => setMode("upload")}
          />
        </div>

        {mode === "find" ? (
          <FindExistingPanel projectId={projectId} onDone={onDone} />
        ) : (
          <UploadNewPanel projectId={projectId} onDone={onDone} />
        )}
      </div>
    </div>
  );
}

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
        active
          ? "border-brand-primary bg-brand-surface text-brand-link"
          : "border-line text-ink-500 hover:text-ink-700"
      }`}
    >
      {label}
    </button>
  );
}

function FindExistingPanel({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: (sourceId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AttachableSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const { sources, error: loadError } = await listAttachableSources(projectId, query);
      if (!cancelled) {
        setResults(sources);
        setError(loadError);
        setIsLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [projectId, query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setIsLoading(true);
  }

  async function handleAttach(sourceId: string) {
    setAttachingId(sourceId);
    setError(null);
    const result = await attachSourceToProject(projectId, sourceId);
    setAttachingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone(sourceId);
  }

  return (
    <div>
      <Input
        autoFocus
        placeholder="Search sources by title…"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        className="mb-3"
      />
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <p className="py-4 text-center text-xs text-ink-400">Searching…</p>
        ) : results.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-400">
            No other sources match. Every other source may already be attached to this project.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {results.map((source) => (
              <li
                key={source.id}
                className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    <span className="mr-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-400">
                      {SOURCE_KIND_LABEL[source.kind]}
                    </span>
                    {source.title}
                  </p>
                  <p className="text-xs text-ink-500">
                    {source.interviewDate && formatShortDate(source.interviewDate, { year: true })}
                    {source.kind === "document"
                      ? source.pageCount
                        ? ` · ${source.pageCount} page${source.pageCount === 1 ? "" : "s"}`
                        : ""
                      : source.durationMs
                        ? ` · ${formatDuration(source.durationMs)}`
                        : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={attachingId === source.id}
                  onClick={() => handleAttach(source.id)}
                  className="shrink-0"
                >
                  {attachingId === source.id ? "Attaching…" : "Reference"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function UploadNewPanel({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: (sourceId: string) => void;
}) {
  const uploads = useSourceUploads();
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const summary = useMemo(() => summarizeTasks(uploads.tasks), [uploads.tasks]);
  const started = uploads.tasks.length > 0;

  // Everything uploaded cleanly: switch the project to the first new source.
  useEffect(() => {
    if (!summary.finished || summary.failed > 0) return;
    const first = uploads.uploadedSourceIds()[0];
    if (first) onDone(first);
    // uploadedSourceIds changes with the task list, which `summary` already tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.finished, summary.failed]);

  function handleUpload() {
    const actions: SourceUploadActions = {
      createSource: (input) => createSourceForProject(projectId, input),
      completeSource: (input) => completeSourceUpload({ projectId, ...input }),
      failSource: (input) => failSourceUpload({ projectId, ...input }),
    };
    uploads.begin(staged, actions);
  }

  if (started) {
    const first = uploads.uploadedSourceIds()[0];
    return (
      <div className="flex flex-col gap-3">
        <BatchRunPanel
          tasks={uploads.tasks}
          running={uploads.running}
          onStop={uploads.stop}
          onResume={uploads.resume}
          onRetry={(id) => uploads.retry([id])}
          onRetryFailed={uploads.retryFailed}
        />
        {!uploads.running && summary.failed > 0 && first && (
          <Button type="button" variant="secondary" onClick={() => onDone(first)}>
            Open the {summary.done} that uploaded
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StagedFiles staged={staged} onChange={setStaged} />
      <Button type="button" disabled={staged.length === 0} onClick={handleUpload}>
        {staged.length === 0
          ? "Upload"
          : `Upload ${staged.length} file${staged.length === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
