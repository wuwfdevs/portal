"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import type { SelectionRange } from "@/lib/transcription/selection";
import { createClip } from "./clip-actions";

/**
 * The panel that turns a transcript selection into a clip.
 *
 * Pinned rather than placed under the transcript: it used to render below a
 * fixed-height scrolling pane, so selecting text near the top of a long
 * interview appeared to do nothing at all. Fixed to the bottom on narrow
 * screens, part of the sticky clips rail on wide ones.
 */
export function ClipComposer({
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
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleCreate() {
    if (!title.trim()) {
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
      title,
      excerpt: selection.excerpt,
    });
    setIsPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setTitle("");
    onCreated();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-primary bg-white p-4 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] lg:static lg:rounded lg:border lg:shadow-none">
      <div className="mx-auto max-w-5xl lg:max-w-none">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-700">New excerpt</p>
          <p className="font-mono text-[11px] text-ink-500">
            {formatDuration(selection.startMs)}–{formatDuration(selection.endMs)} (
            {formatDuration(selection.endMs - selection.startMs)})
          </p>
        </div>

        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-ink-500">
          &ldquo;{selection.excerpt}&rdquo;
        </p>

        <div className="mb-3">
          <Label htmlFor="clip-title">Excerpt title</Label>
          <Input
            id="clip-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            placeholder="What is this quote?"
          />
        </div>

        {error && <p className="mb-2 text-xs text-danger">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleCreate}
            disabled={isPending}
            className="px-3 py-1.5 text-xs"
          >
            {isPending ? "Creating…" : "Create excerpt"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onPreview(selection.startMs, selection.endMs)}
            className="px-3 py-1.5 text-xs"
          >
            Preview
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} className="px-2 py-1.5 text-xs">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
