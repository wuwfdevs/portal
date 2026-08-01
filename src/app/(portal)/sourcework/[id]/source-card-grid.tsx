"use client";

import { useState } from "react";
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
 * Card grid of every source this project references, plus a way to add
 * another (docs/sourcework-design.md §7.2 — this replaces that phase's pill
 * row, which didn't scale visually once a project referenced more than a
 * handful of sources). Clicking a card switches ?source=, same as a pill
 * did — the workspace below still renders inline on this page, it's only
 * the source switcher that changed shape.
 */
export function SourceCardGrid({
  projectId,
  sources,
  activeSourceId,
}: {
  projectId: string;
  sources: ProjectSourceSummary[];
  activeSourceId: string | null;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="mb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => {
          const isActive = s.sourceId === activeSourceId;
          const badge = statusBadge(s.status, s.source.kind);
          return (
            <Link
              key={s.sourceId}
              href={`/sourcework/${projectId}?source=${s.sourceId}`}
              scroll={false}
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
                {new Date(s.source.interview_date ?? s.source.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
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
      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIsAdding(true)}
          className="px-3 py-1.5 text-xs"
        >
          + Add source
        </Button>
      </div>
      {isAdding && (
        <AddSourceModal
          projectId={projectId}
          onClose={() => setIsAdding(false)}
          onDone={(sourceId) => {
            setIsAdding(false);
            router.push(`/sourcework/${projectId}?source=${sourceId}`);
          }}
        />
      )}
    </div>
  );
}
