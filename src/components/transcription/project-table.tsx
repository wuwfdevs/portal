"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { formatBytes, formatShortDate } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import type { ProjectListRow } from "@/lib/transcription/projects";
import { projectStatusMap } from "@/lib/transcription/status";

function formatInterviewDate(project: ProjectListRow): string {
  return formatShortDate(project.interviewDate ?? project.createdAt, { year: true });
}

function formatSize(project: ProjectListRow): string {
  if (project.sourceKind === "document") {
    return project.pageCount
      ? `${project.pageCount} page${project.pageCount === 1 ? "" : "s"}`
      : "—";
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
      <EmptyState>No projects yet. Start one, then add interviews and documents to it.</EmptyState>
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
        <TableFrame>
          <Table stack className="md:min-w-[720px]">
            <thead>
              <HeaderRow>
                <Th>Title</Th>
                <Th>Date</Th>
                <Th>Duration / pages</Th>
                <Th>Size</Th>
                <Th>Status</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <Row key={project.id} className="hover:bg-panel-50">
                  <Cell stack="title">
                    <Link
                      href={`/sourcework/${project.id}`}
                      className="font-semibold text-brand-link"
                    >
                      {project.title}
                    </Link>
                    {project.description && (
                      <p className="mt-0.5 max-w-md truncate text-xs text-ink-400 max-md:max-w-none max-md:whitespace-normal">
                        {project.description}
                      </p>
                    )}
                  </Cell>
                  <Cell label="Date" className="text-ink-500">
                    {project.sourceKind === "document" ? "—" : formatInterviewDate(project)}
                  </Cell>
                  <Cell label="Duration / pages" className="text-ink-500">
                    {formatSize(project)}
                  </Cell>
                  <Cell label="Size" className="text-ink-500">
                    {project.sizeBytes ? formatBytes(project.sizeBytes) : "—"}
                  </Cell>
                  <Cell stack="aside">
                    {project.sourceCount === 0 ? (
                      <Badge variant="muted">No sources</Badge>
                    ) : (
                      <StatusBadge
                        map={projectStatusMap(project.sourceKind ?? "audio_video")}
                        value={project.status}
                      />
                    )}
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
