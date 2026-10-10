"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import { suggestExcerptTitle } from "@/lib/transcription/excerpt-title";
import type { SelectionRange } from "@/lib/transcription/selection";
import { createClip, proposeClipTitle } from "./clip-actions";

/**
 * The bar that turns a transcript selection into an excerpt, sitting just below
 * the transcript pane so it appears next to the words just selected, not in a
 * rail across the screen. From lg up it is sticky to the bottom of the
 * viewport, so it stays in reach when the pane ends below the fold. On a phone it is a sheet that
 * rises from just above the docked player (see PlayerBar's `--player-dock-h`),
 * with the title on its own full-width row and the buttons below it, so the
 * keyboard and a thumb both have room. The title is filled in from the
 * first words of the selection at once, then replaced by a short descriptive
 * title from the model when it arrives (unless the reporter has already
 * typed), so saving is one keypress (Enter) and renaming can wait. The title
 * becomes the quote id in the exported file name. Mount it with a `key` per
 * selection so the suggestion follows a new selection.
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
  // Set once the reporter types: the model's title never overwrites their words.
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  const edited = useRef(false);
  const proposal = useRef<Promise<void> | null>(null);

  // Asked after a short pause, so dragging a selection around doesn't ask for every stretch.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      proposal.current = proposeClipTitle(selection.excerpt)
        .then(({ title: proposed }) => {
          if (!cancelled && !edited.current && proposed) setTitle(proposed);
        })
        .catch(() => {});
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selection.excerpt]);

  async function handleCreate() {
    // Saving straight away on the first words would keep the weaker title; wait for the proposal.
    if (!edited.current && proposal.current) await proposal.current;
    const finalTitle = titleRef.current.trim() || suggestion;
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
      className="z-50 flex flex-col gap-2 border border-brand-primary bg-white p-3 shadow-lg max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[var(--player-dock-h,7rem)] max-lg:rounded-t-xl max-lg:border-x-0 lg:sticky lg:bottom-3 lg:z-10 lg:mx-3 lg:mt-2 lg:gap-1.5 lg:rounded lg:p-2.5"
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
          onChange={(event) => {
            edited.current = true;
            setTitle(event.target.value);
          }}
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
