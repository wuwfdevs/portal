"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import type { ProjectStatus, SourceLibraryRow } from "@/lib/transcription/projects";
import type { SwSourceKind } from "@/lib/database.types";

const STATUS_BADGE: Record<
  ProjectStatus,
  { label: string; variant: "accent" | "neutral" | "muted" | "danger" }
> = {
  ready: { label: "Ready", variant: "accent" },
  uploading: { label: "Uploading", variant: "neutral" },
  processing: { label: "Transcribing", variant: "neutral" },
  failed: { label: "Failed", variant: "danger" },
};

const KIND_LABEL: Record<SwSourceKind, string> = {
  audio_video: "Audio",
};

/**
 * Card grid of every source visible to the caller, independent of any one
 * project (docs/sourcework-design.md §7.2) — for "we already have this
 * recording" instead of re-uploading it into a second project.
 *
 * Search and the type filter are client-side: the source library is one
 * flat, RLS-scoped table read once, not worth a server round trip per
 * keystroke. The type chip is inert with the one source kind that exists
 * today (audio) — present so this isn't rebuilt the day Phase 3b adds a
 * second kind (document).
 */
export function SourceLibrary({ sources }: { sources: SourceLibraryRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return sources;
    return sources.filter((source) => source.title.toLowerCase().includes(trimmed));
  }, [sources, query]);

  if (sources.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No sources yet. Upload an interview from a project to get started.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Search sources by title…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <span className="inline-flex w-fit items-center rounded-full border border-brand-primary bg-brand-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-link">
          Audio
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-500">No sources match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((source) => {
            const badge = STATUS_BADGE[source.status];
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
                  {source.durationMs ? ` · ${formatDuration(source.durationMs)}` : ""}
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
