"use client";

import { useRef, useState } from "react";
import { findActiveSegmentIndex } from "@/lib/transcription/transcript";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";
import { SpeakerPanel } from "./speaker-panel";
import { SegmentRow } from "./segment-row";

/**
 * The player, speaker naming, and the transcript as one coupled surface:
 * click a line's timestamp to jump there, the current line follows along
 * during playback, and correcting text or naming a speaker saves in place.
 * See docs/transcription-workspace-design.md Phase 3.
 *
 * `speakers` is lifted into local state because renaming one needs to
 * propagate immediately to every segment's speaker dropdown, not just the
 * one input that was edited — see the panel's onRenamed callback. `segments`
 * is read straight from props on purpose: split/merge change the row count
 * itself, and re-deriving that correctly (new server-generated ids,
 * shifted positions) isn't worth duplicating client-side, so those actions
 * call router.refresh() and let the next render carry the truth.
 */
export function TranscriptWorkspace({
  mediaUrl,
  isVideo,
  segments,
  speakers: initialSpeakers,
}: {
  mediaUrl: string;
  isVideo: boolean;
  segments: TranscriptSegment[];
  speakers: TranscriptSpeaker[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [speakers, setSpeakers] = useState(initialSpeakers);

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

  function handleSpeakerRenamed(speakerId: string, displayName: string) {
    setSpeakers((prev) =>
      prev.map((s) => (s.id === speakerId ? { ...s, displayName: displayName || null } : s)),
    );
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

      <SpeakerPanel
        speakers={speakers}
        segments={segments}
        onSeek={seekTo}
        onRenamed={handleSpeakerRenamed}
      />

      {segments.length === 0 ? (
        <p className="text-sm text-ink-500">
          The transcript didn&apos;t come back with any speech.
        </p>
      ) : (
        <div className="max-h-[560px] overflow-y-auto rounded border border-line">
          {segments.map((segment, index) => (
            <SegmentRow
              key={segment.id}
              segment={segment}
              speakers={speakers}
              isActive={index === activeIndex}
              isLast={index === segments.length - 1}
              onSeek={seekTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
