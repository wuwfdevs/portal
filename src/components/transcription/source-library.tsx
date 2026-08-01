"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import type { SourceLibraryRow } from "@/lib/transcription/projects";
import { processingLabel, type ProjectStatus } from "@/lib/transcription/status";
import type { SwSourceKind } from "@/lib/database.types";

const KIND_LABEL: Record<SwSourceKind, string> = {
  audio_video: "Audio",
  document: "PDF",
};

const KIND_FILTERS: { value: SwSourceKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "audio_video", label: "Audio" },
  { value: "document", label: "PDF" },
];

function statusBadge(
  status: ProjectStatus,
  kind: SwSourceKind,
): { label: string; variant: "accent" | "neutral" | "muted" | "danger" } {
  switch (status) {
    case "ready":
      return { label: "Ready", variant: "accent" };
    case "uploading":
      return { label: "Uploading", variant: "neutral" };
    case "processing":
      return { label: processingLabel(kind), variant: "neutral" };
    case "failed":
      return { label: "Failed", variant: "danger" };
  }
}

/**
 * Card grid of every source visible to the caller, independent of any one
 * project (docs/sourcework-design.md §7.2) — for "we already have this
 * recording/document" instead of re-uploading it into a second project.
 *
 * The filter and the type chips are client-side: the source library is one
 * flat, RLS-scoped table read once, not worth a server round trip per
 * keystroke. This is a *filter* over this tab's already-loaded rows
 * (title only, plus kind), not the archive-wide *search* bar above the
 * tabs — same pattern as ProjectTable's and ClipLibrary's tab-local
 * filters. The kind chips were inert with the one source kind that existed
 * before Phase 3b (docs/sourcework-design.md §8.10) — now real.
 */
export function SourceLibrary({ sources }: { sources: SourceLibraryRow[] }) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<SwSourceKind | "all">("all");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return sources.filter((source) => {
      if (kindFilter !== "all" && source.kind !== kindFilter) return false;
      if (trimmed && !source.title.toLowerCase().includes(trimmed)) return false;
      return true;
    });
  }, [sources, query, kindFilter]);

  if (sources.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No sources yet. Upload an interview or a PDF from a project to get started.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Filter sources by title…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-1.5">
          {KIND_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setKindFilter(filter.value)}
              className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                kindFilter === filter.value
                  ? "border-brand-primary bg-brand-surface text-brand-link"
                  : "border-line text-ink-400 hover:border-ink-300"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-500">
          {query ? `No sources match "${query}".` : "No sources match this filter."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((source) => {
            const badge = statusBadge(source.status, source.kind);
            return (
              <Link
                key={source.id}
                href={`/sourcework/sources/${source.id}`}
                className="flex flex-col gap-2 rounded border border-line bg-white p-4 hover:border-brand-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    {KIND_LABEL[source.kind] ?? source.kind}
                  </span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className="font-semibold text-ink-900">{source.title}</p>
                <p className="text-xs text-ink-500">
                  {new Date(source.interviewDate ?? source.createdAt).toLocaleDateString("en-US", {
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
                <p className="text-xs text-ink-400">
                  {source.projectCount === 0
                    ? "Not used in any project yet"
                    : `Used in ${source.projectCount} project${source.projectCount === 1 ? "" : "s"}`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
