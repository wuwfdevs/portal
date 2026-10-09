"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { sourcePath } from "@/lib/transcription/links";
import type { SourceLibraryRow } from "@/lib/transcription/projects";
import { SourceCard, formatSourceMeta } from "./source-card";
import type { SwSourceKind } from "@/lib/database.types";

import { pluralize } from "@/lib/format";
const KIND_FILTERS: { value: SwSourceKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "audio_video", label: "Audio" },
  { value: "document", label: "PDF" },
];

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
      <EmptyState>
        No sources yet. Upload an interview or a PDF from a project to get started.
      </EmptyState>
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
              aria-pressed={kindFilter === filter.value}
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
          {filtered.map((source) => (
            <SourceCard
              key={source.id}
              href={sourcePath(source.id)}
              kind={source.kind}
              status={source.status}
              title={source.title}
              meta={formatSourceMeta({
                kind: source.kind,
                date: source.interviewDate ?? source.createdAt,
                durationMs: source.durationMs,
                pageCount: source.pageCount,
              })}
              footnote={
                source.projectCount === 0
                  ? "Not used in any project yet"
                  : `Used in ${pluralize(source.projectCount, "project")}`
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
