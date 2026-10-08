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
 * selected, not in a rail across the screen. The title is filled in from the
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
      className="absolute inset-x-3 bottom-3 z-10 flex flex-col gap-1.5 rounded border border-brand-primary bg-white p-2.5 shadow-lg"
    >
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
          className="min-w-[14rem] flex-1 py-1.5"
        />
        <span className="font-mono text-[11px] text-ink-500">
          {formatDuration(selection.startMs)}–{formatDuration(selection.endMs)} (
          {formatDuration(selection.endMs - selection.startMs)})
        </span>
        <Button type="button" size="sm" onClick={handleCreate} disabled={isPending}>
          {isPending ? "Saving…" : "Save excerpt"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onPreview(selection.startMs, selection.endMs)}
        >
          Preview
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
