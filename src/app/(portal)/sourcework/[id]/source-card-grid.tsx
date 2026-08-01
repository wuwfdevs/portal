"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/transcription/media";
import type { ProjectSourceSummary } from "@/lib/transcription/projects";
import { processingLabel, type ProjectStatus } from "@/lib/transcription/status";
import type { SwSourceKind } from "@/lib/database.types";
import { AddSourceModal } from "./add-source-modal";

const KIND_LABEL: Record<SwSourceKind, string> = {
  audio_video: "Audio",
  document: "PDF",
};

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
 * Switches between a card grid of every source this project references and
 * the active source's workspace (passed in as `children`, already rendered
 * server-side by the page) — only one is ever visible at a time, standard
 * list/detail behavior: picking a card collapses the grid and reveals that
 * source's workspace; the "Sources (N)" toggle brings the grid back to pick
 * a different one. Replaces the old pill row (docs/sourcework-design.md
 * §7.2), which didn't scale visually once a project referenced more than a
 * handful of sources and, unlike this, left the workspace and the switcher
 * both on screen at once.
 */
export function SourceCardGrid({
  projectId,
  sources,
  activeSourceId,
  children,
}: {
  projectId: string;
  sources: ProjectSourceSummary[];
  activeSourceId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);

  return (
    <div className="mb-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIsAdding(true)}
          className="px-3 py-1.5 text-xs"
        >
          + Add source
        </Button>
        {sources.length > 1 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsBrowsing((browsing) => !browsing)}
            className="px-3 py-1.5 text-xs"
          >
            {isBrowsing ? "Hide sources" : `Sources (${sources.length})`}
          </Button>
        )}
      </div>

      {isBrowsing ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((s) => {
            const isActive = s.sourceId === activeSourceId;
            const badge = statusBadge(s.status, s.source.kind);
            return (
              <Link
                key={s.sourceId}
                href={`/sourcework/${projectId}?source=${s.sourceId}`}
                scroll={false}
                onClick={() => setIsBrowsing(false)}
                className={`flex flex-col gap-2 rounded border p-4 ${
                  isActive
                    ? "border-brand-primary bg-brand-surface"
                    : "border-line bg-white hover:border-brand-primary"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    {KIND_LABEL[s.source.kind]}
                  </span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className="font-semibold text-ink-900">{s.source.title}</p>
                <p className="text-xs text-ink-500">
                  {new Date(s.source.interview_date ?? s.source.created_at).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                  {s.source.kind === "document"
                    ? s.source.page_count
                      ? ` · ${s.source.page_count} page${s.source.page_count === 1 ? "" : "s"}`
                      : ""
                    : s.source.original_duration_ms
                      ? ` · ${formatDuration(s.source.original_duration_ms)}`
                      : ""}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        children
      )}

      {isAdding && (
        <AddSourceModal
          projectId={projectId}
          onClose={() => setIsAdding(false)}
          onDone={(sourceId) => {
            setIsAdding(false);
            setIsBrowsing(false);
            router.push(`/sourcework/${projectId}?source=${sourceId}`);
          }}
        />
      )}
    </div>
  );
}
