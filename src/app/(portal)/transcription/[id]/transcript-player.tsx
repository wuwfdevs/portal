"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/transcription/media";
import { findActiveSegmentIndex } from "@/lib/transcription/transcript";
import type { TranscriptSegment } from "@/lib/transcription/projects";

/**
 * The player and the transcript as one coupled surface: click a line to jump
 * there, and the current line follows along during playback. Read-only for
 * now — correction and clip creation land in later phases (see design doc).
 */
export function TranscriptPlayer({
  mediaUrl,
  isVideo,
  segments,
}: {
  mediaUrl: string;
  isVideo: boolean;
  segments: TranscriptSegment[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  function getMediaElement(): HTMLMediaElement | null {
    return videoRef.current ?? audioRef.current;
  }

  function handleTimeUpdate() {
    const el = getMediaElement();
    if (!el) return;
    setActiveIndex(findActiveSegmentIndex(segments, Math.round(el.currentTime * 1000)));
  }

  function seekTo(startMs: number) {
    const el = getMediaElement();
    if (!el) return;
    el.currentTime = startMs / 1000;
    void el.play();
  }

  return (
    <div className="flex flex-col gap-5">
      {isVideo ? (
        <video
          ref={videoRef}
          controls
          src={mediaUrl}
          onTimeUpdate={handleTimeUpdate}
          className="w-full rounded bg-panel-100"
        />
      ) : (
        <audio
          ref={audioRef}
          controls
          src={mediaUrl}
          onTimeUpdate={handleTimeUpdate}
          className="w-full"
        />
      )}

      {segments.length === 0 ? (
        <p className="text-sm text-ink-500">
          The transcript didn&apos;t come back with any speech.
        </p>
      ) : (
        <div className="max-h-[480px] overflow-y-auto rounded border border-line">
          {segments.map((segment, index) => (
            <button
              key={segment.id}
              type="button"
              onClick={() => seekTo(segment.startMs)}
              className={cn(
                "block w-full border-b border-line px-4 py-3 text-left last:border-b-0",
                index === activeIndex ? "bg-brand-surface" : "hover:bg-panel-50",
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-ink-500">
                <span>{segment.speakerLabel}</span>
                <span className="font-mono text-[11px] font-normal text-ink-400">
                  {formatDuration(segment.startMs)}
                </span>
              </div>
              <p className="text-sm text-ink-900">{segment.text}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
