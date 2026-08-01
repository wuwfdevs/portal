"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import type { SwSourceKind } from "@/lib/database.types";
import { listAttachableSources, attachSourceToProject, type AttachableSource } from "./source-actions";

const KIND_LABEL: Record<SwSourceKind, string> = {
  audio_video: "Audio",
  document: "PDF",
};

/**
 * Search/select picker for "+ Reference another source". No confirmation
 * step on attach — sharing a source across projects doesn't touch RLS or
 * risk data loss, a product call this repo resolved against the extra
 * friction (docs/sourcework-design.md §7.4).
 */
export function AttachSourceModal({
  projectId,
  onClose,
  onAttached,
}: {
  projectId: string;
  onClose: () => void;
  onAttached: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AttachableSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const sources = await listAttachableSources(projectId, query);
      if (!cancelled) {
        setResults(sources);
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
    onAttached();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded border border-line bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-900">Reference another source</p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-ink-400 hover:text-ink-700"
          >
            Close
          </button>
        </div>
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
                        {KIND_LABEL[source.kind]}
                      </span>
                      {source.title}
                    </p>
                    <p className="text-xs text-ink-500">
                      {source.interviewDate &&
                        new Date(source.interviewDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
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
                    disabled={attachingId === source.id}
                    onClick={() => handleAttach(source.id)}
                    className="shrink-0 px-2.5 py-1 text-xs"
                  >
                    {attachingId === source.id ? "Attaching…" : "Reference"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
