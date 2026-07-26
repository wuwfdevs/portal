"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import { findActiveSegmentIndex } from "@/lib/transcription/transcript";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";
import type { ProjectClip } from "@/lib/transcription/clips";
import { SpeakerPanel } from "./speaker-panel";
import { SegmentRow } from "./segment-row";
import { ClipRail } from "./clip-rail";
import { createClip } from "./clip-actions";

/**
 * The player, speaker naming, transcript, and clips as one coupled surface
 * (see docs/transcription-workspace-design.md Phase 4 — this is the finish
 * line for the tool's core promise). One "use client" boundary owns the
 * shared media element so seeking/previewing works the same way whether
 * it's triggered from a transcript line, a speaker's example, or a clip's
 * preview button.
 *
 * `speakers` is lifted into local state because renaming one needs to
 * propagate immediately everywhere it's shown — see the panel's onRenamed
 * callback. `segments` and `clips` are read straight from props on purpose:
 * split/merge and clip creation/export change server-generated ids and
 * values that aren't worth re-deriving client-side, so those actions call
 * router.refresh() and let the next render carry the truth.
 */
export function TranscriptWorkspace({
  projectId,
  mediaUrl,
  isVideo,
  segments,
  speakers: initialSpeakers,
  clips,
}: {
  projectId: string;
  mediaUrl: string;
  isVideo: boolean;
  segments: TranscriptSegment[];
  speakers: TranscriptSpeaker[];
  clips: ProjectClip[];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAtMsRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [speakers, setSpeakers] = useState(initialSpeakers);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  function getMediaElement(): HTMLMediaElement | null {
    return videoRef.current ?? audioRef.current;
  }

  function handleTimeUpdate() {
    const el = getMediaElement();
    if (!el) return;
    const currentMs = Math.round(el.currentTime * 1000);
    if (stopAtMsRef.current !== null && currentMs >= stopAtMsRef.current) {
      el.pause();
      stopAtMsRef.current = null;
    }
    setActiveIndex(findActiveSegmentIndex(segments, currentMs));
  }

  function seekTo(startMs: number) {
    const el = getMediaElement();
    if (!el) return;
    stopAtMsRef.current = null;
    el.currentTime = startMs / 1000;
    void el.play();
  }

  function previewRange(startMs: number, endMs: number) {
    const el = getMediaElement();
    if (!el) return;
    stopAtMsRef.current = endMs;
    el.currentTime = startMs / 1000;
    void el.play();
  }

  function handleSpeakerRenamed(speakerId: string, displayName: string) {
    setSpeakers((prev) =>
      prev.map((s) => (s.id === speakerId ? { ...s, displayName: displayName || null } : s)),
    );
  }

  function toggleSegmentSelection(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  const hasSelection = selectedIndices.size > 0;
  const rangeStart = hasSelection ? Math.min(...selectedIndices) : -1;
  const rangeEnd = hasSelection ? Math.max(...selectedIndices) : -1;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
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
          <>
            <div className="max-h-[560px] overflow-y-auto rounded border border-line">
              {segments.map((segment, index) => (
                <SegmentRow
                  key={segment.id}
                  segment={segment}
                  speakers={speakers}
                  isActive={index === activeIndex}
                  isLast={index === segments.length - 1}
                  isSelected={selectedIndices.has(index)}
                  isInSelectionRange={hasSelection && index >= rangeStart && index <= rangeEnd}
                  onSeek={seekTo}
                  onToggleSelect={() => toggleSegmentSelection(index)}
                />
              ))}
            </div>

            {hasSelection && (
              <ClipComposer
                projectId={projectId}
                segments={segments}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onPreview={previewRange}
                onCancel={() => setSelectedIndices(new Set())}
                onCreated={() => {
                  setSelectedIndices(new Set());
                  router.refresh();
                }}
              />
            )}
          </>
        )}
      </div>

      <ClipRail clips={clips} onPreview={previewRange} />
    </div>
  );
}

function ClipComposer({
  projectId,
  segments,
  rangeStart,
  rangeEnd,
  onPreview,
  onCancel,
  onCreated,
}: {
  projectId: string;
  segments: TranscriptSegment[];
  rangeStart: number;
  rangeEnd: number;
  onPreview: (startMs: number, endMs: number) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const selected = segments.slice(rangeStart, rangeEnd + 1);
  const startMs = selected[0]?.startMs ?? 0;
  const endMs = selected[selected.length - 1]?.endMs ?? 0;
  const excerpt = selected.map((s) => s.text).join(" ");

  async function handleCreate() {
    if (!title.trim()) {
      setError("Give the clip a title.");
      return;
    }
    setIsPending(true);
    setError(null);
    const result = await createClip({ projectId, startMs, endMs, title, excerpt });
    setIsPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onCreated();
  }

  return (
    <div className="rounded border border-brand-primary bg-brand-surface/40 p-4">
      <p className="mb-2 text-xs font-semibold text-ink-700">
        {selected.length} line{selected.length === 1 ? "" : "s"} selected ({formatDuration(startMs)}
        –{formatDuration(endMs)})
      </p>
      <p className="mb-3 line-clamp-2 text-xs text-ink-500">{excerpt}</p>
      <div className="mb-3">
        <Label htmlFor="clip-title">Clip title</Label>
        <Input
          id="clip-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is this quote?"
        />
      </div>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleCreate} disabled={isPending}>
          {isPending ? "Creating…" : "Create clip"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => onPreview(startMs, endMs)}>
          Preview
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
