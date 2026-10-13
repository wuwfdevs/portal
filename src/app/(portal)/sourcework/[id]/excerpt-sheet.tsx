"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import type { ProjectClip } from "@/lib/transcription/clips";
import type { TextSegment } from "@/lib/sourcework/piece-text";
import { ClipCard } from "./clip-rail";
import { PauseIcon, PlayIcon } from "./transport-icons";

/** Past this many excerpts over one word, a menu reads better than side-by-side buttons. */
const SWITCHER_MAX_SEGMENTS = 3;

/**
 * What tapping a saved excerpt's words does on a phone. On desktop the same tap
 * selects the excerpt's card in the rail beside the transcript; below lg the
 * rail is another tab, so nothing visible happened. This is a sheet that rises
 * from just above the docked player (the same place as SelectionToolbar's), in
 * two layers: a peek with the one thing wanted most (Play) and the way on, and
 * the whole ClipCard — rename, trim, level, export, delete — when Edit is
 * chosen. It reuses ClipCard rather than copying its handlers, so there is one
 * implementation of each. Below lg only; from lg up the rail does this job.
 *
 * `clips` is every excerpt covering the tapped word, shortest first; with more
 * than one, a switcher picks which the sheet shows.
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
  const playing = playingClipId === clip.id;

  return (
    <div
      role="dialog"
      aria-label="Excerpt"
      className="fixed inset-x-0 bottom-[var(--player-dock-h,7rem)] z-50 flex max-h-[calc(100dvh-var(--player-dock-h,7rem)-4rem)] flex-col rounded-t-xl border border-x-0 border-brand-primary bg-white shadow-lg lg:hidden"
    >
      <div className="flex flex-col gap-2 px-4 pb-3 pt-3">
        {clips.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-500">This spot is in {clips.length} excerpts</span>
            {clips.length <= SWITCHER_MAX_SEGMENTS ? (
              <Segmented
                name="overlapping-excerpts"
                options={clips.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.title,
                }))}
                value={clip.id}
                onChange={onActivate}
                className="self-stretch max-lg:[&_span]:h-11"
              />
            ) : (
              <Select
                value={clip.id}
                onChange={(event) => onActivate(event.target.value)}
                aria-label="Which excerpt"
              >
                {clips.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <strong className="block font-serif text-lg font-semibold leading-tight text-ink-900">
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

        {!expanded && (
          <>
            <p className="line-clamp-2 rounded bg-panel-50 px-2.5 py-2 text-[15px] leading-snug text-ink-700">
              {clip.excerpt}
            </p>
            <div className="flex gap-2">
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
              className="min-h-11 self-start text-brand-link"
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
              segments={segments}
            />
          </div>
          <div className="flex gap-2 border-t border-line px-4 py-3">
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
