"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findActiveSegmentIndex } from "@/lib/transcription/transcript";
import {
  buildTimedTokens,
  resolveSelection,
  type SelectionRange,
  type TokenRef,
} from "@/lib/transcription/selection";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";
import type { ProjectClip } from "@/lib/transcription/clips";
import { SpeakerPanel } from "./speaker-panel";
import { SegmentRow } from "./segment-row";
import { ClipRail } from "./clip-rail";
import { ClipComposer } from "./clip-composer";

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
 * router.refresh() and let the next render carry the truth. The rows
 * themselves sync their editable copies via useSyncedState, so a refresh
 * lands cleanly instead of leaving stale text behind.
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
  const transcriptRef = useRef<HTMLDivElement>(null);
  const stopAtMsRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [speakers, setSpeakers] = useState(initialSpeakers);
  const [selection, setSelection] = useState<SelectionRange | null>(null);

  const tokensBySegment = useMemo(() => segments.map(buildTimedTokens), [segments]);

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

  /**
   * Reads the browser's text selection back into (line, word) coordinates.
   * Runs on mouseup rather than on every `selectionchange` because it walks
   * every rendered word, which is far too much work to repeat per character
   * of a drag across a long interview.
   */
  const captureSelection = useCallback(() => {
    const root = transcriptRef.current;
    const domSelection = window.getSelection();
    if (!root || !domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) {
      setSelection(null);
      return;
    }

    const range = domSelection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }

    const refs: TokenRef[] = [];
    root.querySelectorAll<HTMLElement>("[data-segment-index]").forEach((segmentEl) => {
      const segmentIndex = Number(segmentEl.dataset.segmentIndex);
      segmentEl.querySelectorAll<HTMLElement>("[data-token-index]").forEach((tokenEl) => {
        if (rangeTouches(range, tokenEl)) {
          refs.push({ segmentIndex, tokenIndex: Number(tokenEl.dataset.tokenIndex) });
        }
      });
    });

    setSelection(resolveSelection(tokensBySegment, refs));
  }, [tokensBySegment]);

  // Clicking anywhere collapses the selection; drop the composer when it does,
  // so it never lingers describing a range the user can no longer see.
  useEffect(() => {
    function handleSelectionChange() {
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.isCollapsed) setSelection(null);
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
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
          projectId={projectId}
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
          <div>
            <p className="mb-2 text-xs text-ink-400">
              Select any stretch of text to make a clip. Hover a line to edit, split, merge, or
              reassign it.
            </p>
            <div
              ref={transcriptRef}
              onMouseUp={captureSelection}
              className="max-h-[560px] overflow-y-auto rounded border border-line py-2"
            >
              {segments.map((segment, index) => (
                <SegmentRow
                  key={segment.id}
                  projectId={projectId}
                  segment={segment}
                  tokens={tokensBySegment[index] ?? []}
                  speakers={speakers}
                  segmentIndex={index}
                  isActive={index === activeIndex}
                  isLast={index === segments.length - 1}
                  showSpeaker={index === 0 || segments[index - 1]?.speakerId !== segment.speakerId}
                  onSeek={seekTo}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        {selection && (
          <ClipComposer
            projectId={projectId}
            selection={selection}
            onPreview={previewRange}
            onCancel={clearSelection}
            onCreated={() => {
              clearSelection();
              router.refresh();
            }}
          />
        )}
        <ClipRail clips={clips} onPreview={previewRange} />
      </div>
    </div>
  );
}

/**
 * True when the selection genuinely covers part of `node`, rather than
 * merely ending at its edge — Range.intersectsNode() counts a zero-width
 * touch, which would pull an extra word into every selection.
 */
function rangeTouches(range: Range, node: Node): boolean {
  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);
  return (
    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
  );
}
