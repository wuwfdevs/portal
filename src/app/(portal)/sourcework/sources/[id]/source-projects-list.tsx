"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { projectPath } from "@/lib/transcription/links";

/** Past this many projects the list gets a filter; below it a filter is clutter. */
const FILTER_FROM = 8;

/**
 * The projects that reference a source, for the standalone source view. A
 * recording can be in dozens of projects, so this is a real list (title and
 * background, one tap to open) with a filter once it grows — not a row of links
 * or a capped menu.
 */
export function SourceProjectsList({
  projects,
}: {
  projects: { id: string; title: string; description: string | null }[];
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? projects.filter(
        (project) =>
          project.title.toLowerCase().includes(needle) ||
          (project.description ?? "").toLowerCase().includes(needle),
      )
    : projects;

  if (projects.length === 0) {
    return <p className="py-4 text-sm text-ink-500">Not used in any project yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {projects.length >= FILTER_FROM && (
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter projects"
          aria-label="Filter projects"
        />
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-ink-500">No project matches “{query}”.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((project) => (
            <li key={project.id}>
              <Link
                href={projectPath(project.id)}
                className="flex min-h-14 flex-col justify-center gap-0.5 px-1 py-3 hover:bg-panel-50"
              >
                <span className="font-semibold text-brand-link">{project.title}</span>
                {project.description && (
                  <span className="line-clamp-2 text-sm text-ink-500">{project.description}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
