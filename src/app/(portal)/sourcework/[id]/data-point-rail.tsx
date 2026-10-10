"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { ExtractSourceButton } from "@/components/sourcework/extract-source-button";
import {
  dataPointTag,
  defaultDataPointFilter,
  filterDataPoints,
  reviewCounts,
  type DataPoint,
  type DataPointFilter,
} from "@/lib/sourcework/research";
import { hiddenSummary } from "@/lib/sourcework/data-point-view";
import { canExtract, type ExtractionState } from "@/lib/sourcework/run-state";
import { DataPointCard, type PointSelectionOrigin } from "./data-point-card";
import { ProcessingPoller } from "./processing-poller";

/** What a source screen opened from a project with research questions hands its workspace. */
export interface SourceResearchView {
  points: DataPoint[];
  /** Question id -> "Q1", for the card tags. */
  labels: Record<string, string>;
  extraction: ExtractionState;
  /** Data point id -> the accepted themes it sits in, with links (the card's "Theme:" line). */
  themes: Record<string, { href: string; title: string; stance: "supports" | "complicates" }[]>;
  /** Data point id -> the excerpts that exemplify it (the card's "Excerpt:" line). */
  excerpts: Record<string, { href: string; title: string }[]>;
}

/**
 * The rail's Data points mode: filter chips, cards in the order they occur,
 * and the empty / running / finished-with-none states. Selection is owned by
 * the workspace, which draws the same point on the transcript or the page.
 */
export function DataPointRail({
  projectId,
  sourceId,
  research,
  selectedId,
  selectionOrigin,
  onSelect,
  onPlay,
  onOpen,
}: {
  projectId: string;
  sourceId: string;
  research: SourceResearchView;
  selectedId: string | null;
  selectionOrigin: PointSelectionOrigin | null;
  onSelect: (id: string) => void;
  onPlay?: (point: DataPoint) => void;
  onOpen?: (point: DataPoint) => void;
}) {
  const { points, extraction } = research;
  const labels = useMemo(() => new Map(Object.entries(research.labels)), [research.labels]);
  const counts = useMemo(() => reviewCounts(points), [points]);
  const [chosen, setChosen] = useState<DataPointFilter | null>(null);
  const filter = chosen ?? defaultDataPointFilter(counts);
  const shown = filterDataPoints(points, filter);

  const chips: { value: DataPointFilter; label: string; count: number }[] = [
    { value: "to_review", label: "To review", count: counts.toReview },
    { value: "all", label: "All", count: counts.total },
    { value: "story", label: "Story", count: counts.story },
    ...(counts.rejected > 0
      ? [{ value: "rejected" as const, label: "Rejected", count: counts.rejected }]
      : []),
  ];

  if (points.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {extraction.kind === "running" && <ProcessingPoller />}
        {extraction.kind === "running" ? (
          <EmptyState compact title="Extracting data points…">
            This takes a minute or two. The list fills in on its own.
          </EmptyState>
        ) : extraction.kind === "done" ? (
          <EmptyState
            compact
            title="No data points found"
            action={
              <ExtractSourceButton projectId={projectId} sourceId={sourceId} variant="secondary">
                Run again
              </ExtractSourceButton>
            }
          >
            Nothing in this source answers the project&apos;s questions or adds to the story.
          </EmptyState>
        ) : canExtract(extraction) ? (
          <EmptyState
            compact
            title="No data points yet"
            action={<ExtractSourceButton projectId={projectId} sourceId={sourceId} />}
          >
            {extraction.kind === "failed"
              ? (extraction.error ?? "The last run didn't finish. Run it again.")
              : "Read this source against the project's questions and suggest data points to review."}
          </EmptyState>
        ) : (
          <EmptyState compact>
            {extraction.kind === "waiting"
              ? "Data points can be extracted once this source has finished processing."
              : "This source can't be read right now."}
          </EmptyState>
        )}
      </div>
    );
  }

  const hidden = hiddenSummary(counts, filter);

  return (
    <div className="flex flex-col gap-3">
      {extraction.kind === "running" && <ProcessingPoller />}
      <div role="group" aria-label="Show data points" className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={filter === chip.value}
            onClick={() => setChosen(chip.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold max-lg:h-11 max-lg:px-4",
              filter === chip.value
                ? "border-brand-surface bg-brand-surface text-brand-link"
                : "border-line bg-white text-ink-700 hover:border-brand-primary",
            )}
          >
            {chip.label}
            <span className="text-ink-500">· {chip.count}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-500">
        Dashed underline and dashed card are suggestions not yet reviewed.
      </p>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-500">
          {filter === "to_review"
            ? "Everything has been reviewed."
            : "No data points in this view."}
        </p>
      ) : (
        shown.map((point) => (
          <DataPointCard
            key={point.id}
            point={point}
            tag={dataPointTag(point, labels)}
            isSelected={point.id === selectedId}
            selectionOrigin={selectionOrigin}
            onSelect={() => onSelect(point.id)}
            onPlay={onPlay ? () => onPlay(point) : undefined}
            onOpen={onOpen ? () => onOpen(point) : undefined}
            themes={research.themes[point.id] ?? []}
            excerpts={research.excerpts[point.id] ?? []}
          />
        ))
      )}

      {hidden && <p className="text-xs text-ink-500">{hidden}</p>}

      {canExtract(extraction) && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <ExtractSourceButton projectId={projectId} sourceId={sourceId} variant="secondary">
            Re-run extraction
          </ExtractSourceButton>
          <p className="text-xs text-ink-500">
            Accepted and rejected points are kept; only new ones are added for review.
          </p>
        </div>
      )}
    </div>
  );
}
