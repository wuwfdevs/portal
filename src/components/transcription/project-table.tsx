"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatBytes, formatDuration } from "@/lib/transcription/media";
import type { ProjectListRow } from "@/lib/transcription/projects";
import { processingLabel } from "@/lib/transcription/status";

function statusBadge(
  project: ProjectListRow,
): { label: string; variant: "accent" | "neutral" | "muted" | "danger" } {
  switch (project.status) {
    case "ready":
      return { label: "Ready", variant: "accent" };
    case "uploading":
      return { label: "Uploading", variant: "neutral" };
    case "processing":
      return { label: processingLabel(project.sourceKind ?? "audio_video"), variant: "neutral" };
    case "failed":
      return { label: "Failed", variant: "danger" };
  }
}

function formatInterviewDate(project: ProjectListRow): string {
  return new Date(project.interviewDate ?? project.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSize(project: ProjectListRow): string {
  if (project.sourceKind === "document") {
    return project.pageCount ? `${project.pageCount} page${project.pageCount === 1 ? "" : "s"}` : "—";
  }
  return project.durationMs ? formatDuration(project.durationMs) : "—";
}

/**
 * Table of every project visible to the caller. The filter here is
 * client-side over the already-loaded list, same reasoning as
 * SourceLibrary's — this is a *filter* over one tab's rows (title/background
 * only), not the archive-wide *search* bar above the tabs, which also
 * reaches into transcript and excerpt text.
 */
export function ProjectTable({ projects }: { projects: ProjectListRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return projects;
    return projects.filter(
      (project) =>
        project.title.toLowerCase().includes(trimmed) ||
        (project.description?.toLowerCase().includes(trimmed) ?? false),
    );
  }, [projects, query]);

  if (projects.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No interviews yet. Upload one to get started.
      </div>
    );
  }

  return (
    <div>
      <Input
        type="search"
        placeholder="Filter projects by title…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-4 max-w-xs"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-500">No projects match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Duration / pages</th>
                <th className="px-4 py-2.5">Size</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const badge = statusBadge(project);
                return (
                  <tr
                    key={project.id}
                    className="border-b border-line last:border-b-0 hover:bg-panel-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/sourcework/${project.id}`}
                        className="font-semibold text-brand-link"
                      >
                        {project.title}
                      </Link>
                      {project.description && (
                        <p className="mt-0.5 max-w-md truncate text-xs text-ink-400">
                          {project.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {project.sourceKind === "document" ? "—" : formatInterviewDate(project)}
                    </td>
                    <td className="px-4 py-3 text-ink-500">{formatSize(project)}</td>
                    <td className="px-4 py-3 text-ink-500">
                      {project.sizeBytes ? formatBytes(project.sizeBytes) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
