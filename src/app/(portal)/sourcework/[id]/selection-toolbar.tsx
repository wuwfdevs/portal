"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import { suggestExcerptTitle } from "@/lib/transcription/excerpt-title";
import type { SelectionRange } from "@/lib/transcription/selection";
import { createClip } from "./clip-actions";

/**
 * The bar that turns a transcript selection into an excerpt, docked over the
 * bottom of the transcript pane so it appears next to the words just
 * selected, not in a rail across the screen. On a phone it is a sheet that
 * rises from just above the docked player (see PlayerBar's `--player-dock-h`),
 * with the title on its own full-width row and the buttons below it, so the
 * keyboard and a thumb both have room. The title is filled in from the
 * first words of the selection, so saving is one keypress (Enter) and
 * renaming can wait. Mount it with a `key` per selection so the suggestion
 * follows a new selection.
 */
export function SelectionToolbar({
  sourceId,
  representationId,
  selection,
  onPreview,
  onCancel,
  onCreated,
}: {
  sourceId: string;
  representationId: string | null;
  selection: SelectionRange;
  onPreview: (startMs: number, endMs: number) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const suggestion = suggestExcerptTitle(selection.excerpt);
  const [title, setTitle] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleCreate() {
    const finalTitle = title.trim() || suggestion;
    if (!finalTitle) {
      setError("Give the excerpt a title.");
      return;
    }
    setIsPending(true);
    setError(null);
    const result = await createClip({
      sourceId,
      representationId,
      startMs: selection.startMs,
      endMs: selection.endMs,
      title: finalTitle,
      excerpt: selection.excerpt,
    });
    setIsPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onCreated();
  }

  return (
    <div
      role="toolbar"
      aria-label="Make an excerpt"
      className="z-50 flex flex-col gap-2 border border-brand-primary bg-white p-3 shadow-lg max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[var(--player-dock-h,7rem)] max-lg:rounded-t-xl max-lg:border-x-0 lg:absolute lg:inset-x-3 lg:bottom-3 lg:z-10 lg:gap-1.5 lg:rounded lg:p-2.5"
    >
      <div className="flex items-baseline justify-between gap-3 lg:hidden">
        <strong className="font-serif text-lg font-semibold text-ink-900">New excerpt</strong>
        <span className="font-mono text-xs text-ink-500">
          {formatDuration(selection.startMs)}–{formatDuration(selection.endMs)} (
          {formatDuration(selection.endMs - selection.startMs)})
        </span>
      </div>
      <p className="line-clamp-2 rounded bg-panel-50 px-2.5 py-2 text-[15px] leading-snug text-ink-700 lg:hidden">
        {selection.excerpt}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="clip-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleCreate();
            if (event.key === "Escape") onCancel();
          }}
          aria-label="Excerpt title"
          placeholder="What is this quote?"
          className="w-full lg:w-auto lg:min-w-[14rem] lg:flex-1 lg:py-1.5"
        />
        <span className="hidden font-mono text-[11px] text-ink-500 lg:inline">
          {formatDuration(selection.startMs)}–{formatDuration(selection.endMs)} (
          {formatDuration(selection.endMs - selection.startMs)})
        </span>
        <div className="flex w-full gap-2 lg:contents">
          <Button
            type="button"
            size="sm"
            onClick={handleCreate}
            disabled={isPending}
            className="max-lg:order-3 max-lg:min-h-11 max-lg:flex-1"
          >
            {isPending ? "Saving…" : "Save excerpt"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPreview(selection.startMs, selection.endMs)}
            className="max-lg:order-1 max-lg:min-h-11 max-lg:px-4"
          >
            Preview
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="max-lg:order-2 max-lg:min-h-11 max-lg:px-4"
          >
            Cancel
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
