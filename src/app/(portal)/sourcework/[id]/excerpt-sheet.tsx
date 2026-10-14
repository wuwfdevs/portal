"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CONTROL_ROW } from "@/components/ui/control-row";
import { formatDuration } from "@/lib/transcription/media";
import type { ProjectClip } from "@/lib/transcription/clips";
import type { TextSegment } from "@/lib/sourcework/piece-text";
import { ClipCard } from "./clip-rail";
import { PauseIcon, PlayIcon } from "./transport-icons";

/**
 * What tapping a saved excerpt's words does on a phone. On desktop the same tap
 * selects the excerpt's card in the rail beside the transcript; below lg the
 * rail is another tab, so nothing visible happened. This is a sheet that rises
 * from just above the docked player (the same place as SelectionToolbar's) — or the screen
 * edge, since the workspace hides the player while this is open (it has its own Play) — in
 * two layers: a peek with the one thing wanted most (Play) and the way on, and
 * the whole ClipCard — rename, trim, level, export, delete — when Edit is
 * chosen. It reuses ClipCard rather than copying its handlers, so there is one
 * implementation of each. Below lg only; from lg up the rail does this job.
 *
 * `clips` is every excerpt covering the tapped word, shortest first; with more
 * than one, a "1 of 2" stepper picks which the sheet shows (titles are often long, so they
 * are not repeated as buttons). Everything above the action row is `shrink-0` and the top block
 * scrolls if the screen is short, so a long title or a keyboard never squashes the quote.
 */
export function ExcerptSheet({
  clips,
  activeId,
  onActivate,
  onClose,
  onShowInExcerptsTab,
  playingClipId,
  onPreview,
  onPause,
  onHover,
  onTrimPreview,
  segments,
}: {
  clips: ProjectClip[];
  activeId: string;
  onActivate: (clipId: string) => void;
  onClose: () => void;
  onShowInExcerptsTab: () => void;
  playingClipId: string | null;
  onPreview: (startMs: number, endMs: number, clipId?: string) => void;
  onPause: () => void;
  onHover: (clipId: string | null) => void;
  onTrimPreview: (clipId: string, range: { startMs: number; endMs: number }) => void;
  segments: TextSegment[];
}) {
  const [expanded, setExpanded] = useState(false);
  const clip = clips.find((candidate) => candidate.id === activeId) ?? clips[0];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== "Escape") return;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!clip) return null;
  const clipIndex = clips.indexOf(clip);
  const step = (delta: number) =>
    onActivate(clips[(clipIndex + delta + clips.length) % clips.length]!.id);
  const playing = playingClipId === clip.id;

  return (
    <div
      role="dialog"
      aria-label="Excerpt"
      className="fixed inset-x-0 bottom-[var(--player-dock-h,7rem)] z-50 flex max-h-[calc(100dvh-var(--player-dock-h,7rem)-5rem)] flex-col rounded-t-xl border border-x-0 border-brand-primary bg-white pb-[env(safe-area-inset-bottom)] shadow-lg lg:hidden"
    >
      <div
        className={`flex min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-3 pt-3 [&>*]:shrink-0 ${expanded && clips.length <= 1 ? "hidden" : ""}`}
      >
        {clips.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-ink-500">
              This spot is in {clips.length} excerpts
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => step(-1)}
              aria-label="Previous excerpt"
              className="min-h-11 min-w-11"
            >
              ‹
            </Button>
            <span className="min-w-12 text-center text-sm tabular-nums text-ink-700">
              {clipIndex + 1} of {clips.length}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => step(1)}
              aria-label="Next excerpt"
              className="min-h-11 min-w-11"
            >
              ›
            </Button>
          </div>
        )}

        {/* Editing shows the same title, words and time in the card below, so the header steps aside. */}
        {!expanded && (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <strong className="line-clamp-2 block font-serif text-lg font-semibold leading-tight text-ink-900">
                {clip.title}
              </strong>
              <span className="font-mono text-xs text-ink-500">
                {formatDuration(clip.startMs)}–{formatDuration(clip.endMs)} (
                {formatDuration(clip.endMs - clip.startMs)})
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 min-h-11 min-w-11 px-3 text-base"
            >
              ✕
            </Button>
          </div>
        )}

        {!expanded && (
          <>
            <p className="line-clamp-2 rounded bg-panel-50 px-2.5 py-2 text-[15px] leading-snug text-ink-700">
              {clip.excerpt}
            </p>
            <div className={CONTROL_ROW}>
              <Button
                type="button"
                onClick={() => (playing ? onPause() : onPreview(clip.startMs, clip.endMs, clip.id))}
                className="min-h-12 flex-1 gap-2 text-base"
              >
                {playing ? (
                  <PauseIcon className="h-3.5 w-3.5" />
                ) : (
                  <PlayIcon className="h-3.5 w-3.5" />
                )}
                {playing ? "Pause" : "Play excerpt"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setExpanded(true)}
                className="min-h-12 px-5 text-base"
              >
                Edit
              </Button>
            </div>
            <Button
              type="button"
              variant="link"
              onClick={onShowInExcerptsTab}
              className="min-h-10 self-start text-brand-link"
            >
              Show in Excerpts tab
            </Button>
          </>
        )}
      </div>

      {expanded && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-4 py-3">
            {/* Keyed so switching between overlapping excerpts starts each card fresh. */}
            <ClipCard
              key={clip.id}
              clip={clip}
              selectionOrigin={null}
              onSelect={() => {}}
              onHover={onHover}
              onTrimPreview={onTrimPreview}
              onPreview={onPreview}
              isPlaying={playing}
              onPause={onPause}
              hidePlayButton
              segments={segments}
            />
          </div>
          <div className={`${CONTROL_ROW} border-t border-line px-4 py-3`}>
            <Button
              type="button"
              onClick={() => (playing ? onPause() : onPreview(clip.startMs, clip.endMs, clip.id))}
              className="min-h-12 flex-1 gap-2 text-base"
            >
              {playing ? (
                <PauseIcon className="h-3.5 w-3.5" />
              ) : (
                <PlayIcon className="h-3.5 w-3.5" />
              )}
              {playing ? "Pause" : "Play excerpt"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExpanded(false)}
              className="min-h-12 px-5 text-base"
            >
              Done
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
