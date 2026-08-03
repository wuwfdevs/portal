"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import type { LibraryClip } from "@/lib/transcription/clips";

/**
 * Every clip across every project — the browse half of the clip library
 * (design doc §3F), for when the reporter knows roughly what they have and a
 * query isn't the right way to ask for it.
 *
 * Each row links twice on purpose: the title opens the workspace at the
 * clip's in-point with the clip loaded, and the project name opens the
 * recording it came from. A clip is never a dead end.
 *
 * The filter below is client-side over the already-loaded list, same
 * reasoning as SourceLibrary's and ProjectTable's — it narrows this tab's
 * rows by title/excerpt/project name, and is not a substitute for the
 * archive-wide search bar above the tabs. `showFilter` turns it off for the
 * one caller that already sits behind a stronger, RPC-backed search box of
 * its own (the project workspace's Excerpts tab, wrapped in
 * ScopedSearchPanel) — showing both was two search boxes doing overlapping
 * jobs at different scopes, which read as redundant rather than as two
 * genuinely different tools.
 */
export function ClipLibrary({
  clips,
  showProjectMeta = true,
  showFilter = true,
}: {
  clips: LibraryClip[];
  /** False when every row is already known to belong to the same project (the project workspace's own Excerpts tab) — the per-row project link/description would just repeat itself. */
  showProjectMeta?: boolean;
  /** False when a caller already wraps this in its own (stronger) search box — see the comment above. */
  showFilter?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!showFilter) return clips;
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return clips;
    return clips.filter(
      (clip) =>
        clip.title.toLowerCase().includes(trimmed) ||
        clip.excerpt.toLowerCase().includes(trimmed) ||
        clip.projectTitle.toLowerCase().includes(trimmed) ||
        clip.sourceTitle.toLowerCase().includes(trimmed),
    );
  }, [clips, query, showFilter]);

  if (clips.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No excerpts yet. Open an interview, select a passage in the transcript, and save it as an
        excerpt — it will show up here for everyone.
      </div>
    );
  }

  return (
    <div>
      {showFilter && (
        <Input
          type="search"
          placeholder="Filter excerpts by title…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mb-4 max-w-xs"
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-500">No excerpts match &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((clip) => {
            const isDocument = clip.locatorKind === "document";
            const openParams = isDocument
              ? `page=${clip.pageNumber ?? 1}`
              : `t=${clip.startMs}&clip=${clip.id}`;
            return (
              <li key={clip.id} className="rounded border border-line bg-white p-4">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/sourcework/${clip.projectId}?source=${clip.sourceId}&${openParams}`}
                    className="font-semibold text-brand-link"
                  >
                    {clip.title}
                  </Link>
                  <span className="text-xs text-ink-400">
                    {isDocument
                      ? clip.pageNumber && `p. ${clip.pageNumber}`
                      : formatDuration(clip.endMs! - clip.startMs!)}
                    {clip.hasExport && " · exported"}
                  </span>
                </div>

                {clip.excerpt && (
                  <p className="mb-2 line-clamp-2 text-sm text-ink-700">{clip.excerpt}</p>
                )}

                <p className="text-xs text-ink-500">
                  <Link
                    href={`/sourcework/${clip.projectId}?source=${clip.sourceId}`}
                    className="text-brand-link"
                  >
                    {showProjectMeta ? clip.projectTitle : clip.sourceTitle}
                  </Link>
                  {!isDocument && ` · ${formatDuration(clip.startMs!)}`}
                  {clip.interviewDate &&
                    ` · ${new Date(clip.interviewDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}`}
                </p>

                {showProjectMeta && clip.projectDescription && (
                  <p className="mt-1.5 line-clamp-2 text-xs italic text-ink-400">
                    {clip.projectDescription}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
