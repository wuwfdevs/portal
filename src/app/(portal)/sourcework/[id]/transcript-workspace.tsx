"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findActiveSegmentIndex } from "@/lib/transcription/transcript";
import { findInTranscript, highlightedTokensBySegment } from "@/lib/transcription/find";
import {
  buildTimedTokens,
  findClipStart,
  resolveClipCoverage,
  resolveSelection,
  type SelectionRange,
  type TokenRef,
} from "@/lib/transcription/selection";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";
import type { ProjectClip } from "@/lib/transcription/clips";
import { SpeakersMenu } from "./speakers-menu";
import { SegmentRow } from "./segment-row";
import { ClipRail, type ClipSelectionOrigin } from "./clip-rail";
import { TranscriptExport } from "./transcript-export";
import { SelectionToolbar } from "./selection-toolbar";
import { PlayerBar } from "./player-bar";
import { ShortcutsHelp } from "./shortcuts-help";

const SKIP_MS = 5000;

/**
 * The player, speaker naming, transcript, and clips as one coupled surface
 * (see docs/transcription-workspace-design.md Phase 4 — this is the finish
 * line for the tool's core promise). One "use client" boundary owns the
 * shared media element so seeking/previewing works the same way whether
 * it's triggered from a transcript line, a speaker's example, a clip's
 * preview button, the transport bar, or a keyboard shortcut.
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
  sourceId,
  representationId,
  projectTitle,
  interviewDate,
  exportDate,
  mediaUrl,
  isVideo,
  segments,
  speakers: initialSpeakers,
  clips,
  initialSeekMs = null,
  highlightClipId = null,
}: {
  projectId: string;
  /** The source (pill) this workspace is currently showing — a new excerpt belongs to this one, not necessarily the project's first-added source. */
  sourceId: string;
  representationId: string | null;
  projectTitle: string;
  interviewDate: string | null;
  /** Interview date, falling back to the project's creation date — the date every export filename carries. */
  exportDate: string;
  mediaUrl: string;
  isVideo: boolean;
  segments: TranscriptSegment[];
  speakers: TranscriptSpeaker[];
  clips: ProjectClip[];
  /** ?t= from a search result or clip link — where to put the playhead on arrival. */
  initialSeekMs?: number | null;
  /** ?clip= from a clip result — which clip to surface in the rail. */
  highlightClipId?: string | null;
}) {
  const router = useRouter();
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const stopAtMsRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [speakers, setSpeakers] = useState(initialSpeakers);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const initialSeekAppliedRef = useRef(false);
  // Which clip the transcript and the rail are both pointing at. Seeded from
  // ?clip= so arriving from a search result or the clip library lands on the
  // words, not just the card — one piece of state for the deep link, a click
  // on the transcript, and a click on a card alike. The origin travels with
  // it because it decides which half of the pairing has to move: neither
  // panel should scroll the one the reporter is already looking at.
  const [selectedClip, setSelectedClip] = useState<{
    id: string;
    origin: ClipSelectionOrigin;
  } | null>(highlightClipId ? { id: highlightClipId, origin: "deep-link" } : null);
  const selectedClipId = selectedClip?.id ?? null;
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  /**
   * Clips whose trim the rail is moving, before the 400ms-deferred write
   * lands. Without it the mark on the transcript would trail the nudge by a
   * round-trip and a refresh, which reads as the highlight being broken
   * rather than merely deferred.
   *
   * Entries are never pruned and don't need to be: the card pushes the
   * server's clamped values up as soon as the write returns, so an entry
   * converges on the same range the next `clips` prop carries.
   */
  const [pendingTrims, setPendingTrims] = useState<
    Record<string, { startMs: number; endMs: number }>
  >({});

  const tokensBySegment = useMemo(() => segments.map(buildTimedTokens), [segments]);

  // Find in this transcript: matches over the segment text, not the DOM, so a
  // line that is scrolled far off still counts.
  const matches = useMemo(() => findInTranscript(segments, findQuery), [segments, findQuery]);
  const currentMatch = matches.length === 0 ? -1 : Math.min(findIndex, matches.length - 1);
  const highlights = useMemo(
    () => highlightedTokensBySegment(matches, currentMatch),
    [matches, currentMatch],
  );

  /**
   * Where every clip lands in the transcript. Computed once per change rather
   * than per row, because hovering a card re-renders every line and this walks
   * every word of the interview.
   */
  const clipCoverage = useMemo(
    () =>
      resolveClipCoverage(
        tokensBySegment,
        clips.map((clip) => {
          const trim = pendingTrims[clip.id];
          return {
            id: clip.id,
            startMs: trim?.startMs ?? clip.startMs,
            endMs: trim?.endMs ?? clip.endMs,
          };
        }),
      ),
    [tokensBySegment, clips, pendingTrims],
  );

  function goToMatch(index: number) {
    if (matches.length === 0) return;
    const wrapped = (index + matches.length) % matches.length;
    setFindIndex(wrapped);
    setFollow(false);
    const match = matches[wrapped]!;
    transcriptRef.current
      ?.querySelector(`[data-segment-index="${match.segmentIndex}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const seekTo = useCallback((startMs: number) => {
    const el = mediaRef.current;
    if (!el) return;
    stopAtMsRef.current = null;
    el.currentTime = startMs / 1000;
    void el.play();
  }, []);

  const previewRange = useCallback((startMs: number, endMs: number) => {
    const el = mediaRef.current;
    if (!el) return;
    stopAtMsRef.current = endMs;
    el.currentTime = startMs / 1000;
    void el.play();
  }, []);

  function handleTimeUpdate() {
    const el = mediaRef.current;
    if (!el) return;
    const currentMs = Math.round(el.currentTime * 1000);
    if (stopAtMsRef.current !== null && currentMs >= stopAtMsRef.current) {
      el.pause();
      stopAtMsRef.current = null;
    }
    // Same value bails out of a re-render, so this stays cheap at ~4Hz.
    setActiveIndex(findActiveSegmentIndex(segments, currentMs));
  }

  function handleSpeakerRenamed(speakerId: string, displayName: string) {
    setSpeakers((prev) =>
      prev.map((s) => (s.id === speakerId ? { ...s, displayName: displayName || null } : s)),
    );
  }

  const scrollToActive = useCallback(() => {
    const root = transcriptRef.current;
    if (!root || activeIndex < 0) return;
    root
      .querySelector(`[data-segment-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  /**
   * Clicking a clip in the rail: mark it and go to its words.
   *
   * Following is switched off first, exactly as a wheel gesture does — if the
   * audio is rolling, the follow-along effect would drag the transcript
   * straight back to the playhead and the clip would never arrive.
   */
  function handleSelectFromRail(clipId: string) {
    setSelectedClip({ id: clipId, origin: "rail" });
    setFollow(false);

    const root = transcriptRef.current;
    const start = findClipStart(clipCoverage, clipId);
    if (!root || !start) return;
    root
      .querySelector(
        `[data-segment-index="${start.segmentIndex}"] [data-token-index="${start.tokenIndex}"]`,
      )
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /**
   * Deep link (?t=) — the thing that makes a search hit a *place* rather than
   * a citation (design doc §3F). Seeks without playing: a page that starts
   * blasting audio on arrival is hostile, browsers block it half the time
   * anyway, and setting activeIndex is what scrolls the line into view via
   * the follow-along effect below.
   *
   * Waits for metadata, because currentTime assigned before the media knows
   * its own duration is silently discarded — which looked exactly like the
   * deep link not working at all.
   */
  useEffect(() => {
    const el = mediaRef.current;
    if (initialSeekMs === null || el === null || initialSeekAppliedRef.current) return;

    const apply = () => {
      if (initialSeekAppliedRef.current) return;
      initialSeekAppliedRef.current = true;
      el.currentTime = initialSeekMs / 1000;
      setActiveIndex(findActiveSegmentIndex(segments, initialSeekMs));
    };

    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      apply();
      return;
    }
    el.addEventListener("loadedmetadata", apply, { once: true });
    return () => el.removeEventListener("loadedmetadata", apply);
  }, [initialSeekMs, segments]);

  // Follow-along. Kept off while a line is open for editing: yanking the
  // transcript out from under someone mid-correction is worse than losing
  // the highlight for a moment.
  useEffect(() => {
    if (!follow || editingSegmentId) return;
    scrollToActive();
  }, [follow, editingSegmentId, scrollToActive]);

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

    const resolved = resolveSelection(tokensBySegment, refs);
    setSelection(resolved);
    // Dragging out a new clip supersedes whichever one was open: the composer
    // takes the panel anyway, and leaving the old clip tinted underneath a
    // fresh selection makes it ambiguous which words are about to be cut.
    if (resolved) setSelectedClip(null);
  }, [tokensBySegment]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  // Keyboard shortcuts. Deliberately inert while the user is typing —
  // otherwise Space in a correction would pause playback instead of
  // producing a space.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (target &&
          (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
      ) {
        return;
      }

      const el = mediaRef.current;
      const jumpBy = (delta: number) => {
        const next = activeIndex + delta;
        const segment = segments[next];
        if (segment) seekTo(segment.startMs);
      };

      switch (event.key) {
        case " ":
          event.preventDefault();
          if (el?.paused) void el.play();
          else el?.pause();
          break;
        case "j":
        case "J":
          event.preventDefault();
          if (el) el.currentTime = Math.max(0, el.currentTime - SKIP_MS / 1000);
          break;
        case "l":
        case "L":
          event.preventDefault();
          if (el) el.currentTime = el.currentTime + SKIP_MS / 1000;
          break;
        case "k":
        case "K":
          event.preventDefault();
          el?.pause();
          break;
        case "ArrowUp":
          event.preventDefault();
          jumpBy(-1);
          break;
        case "ArrowDown":
          event.preventDefault();
          jumpBy(1);
          break;
        case "e":
        case "E": {
          const segment = segments[activeIndex];
          if (segment) {
            event.preventDefault();
            setEditingSegmentId(segment.id);
          }
          break;
        }
        case "c":
        case "C":
          if (selection) {
            event.preventDefault();
            document.getElementById("clip-title")?.focus();
          }
          break;
        default:
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, segments, selection, seekTo]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-4">
        {isVideo ? (
          <video
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={mediaUrl}
            onTimeUpdate={handleTimeUpdate}
            className="w-full rounded bg-panel-100"
          />
        ) : (
          // Hidden, not absent: the transport bar is the only control
          // surface, but the element still has to exist to play anything.
          <audio
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={mediaUrl}
            onTimeUpdate={handleTimeUpdate}
            className="hidden"
          />
        )}

        <PlayerBar
          mediaRef={mediaRef}
          marks={clips.map((clip) => ({
            id: clip.id,
            title: clip.title,
            startMs: clip.startMs,
            endMs: clip.endMs,
          }))}
          onSelectMark={handleSelectFromRail}
          follow={follow}
          onToggleFollow={() => {
            // Off → on doubles as "take me back to the playhead".
            setFollow((current) => !current);
            if (!follow) scrollToActive();
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <SpeakersMenu
            projectId={projectId}
            speakers={speakers}
            segments={segments}
            onSeek={seekTo}
            onRenamed={handleSpeakerRenamed}
          />
          <span className="flex-1" />
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              goToMatch(currentMatch + 1);
            }}
            className="flex items-center gap-1.5"
          >
            <Input
              type="search"
              value={findQuery}
              onChange={(event) => {
                setFindQuery(event.target.value);
                setFindIndex(0);
              }}
              placeholder="Find in this transcript"
              aria-label="Find in this transcript"
              className="w-52 px-2.5 py-1.5"
            />
            {findQuery.trim().length >= 2 && (
              <>
                <span className="whitespace-nowrap text-xs text-ink-500" aria-live="polite">
                  {matches.length === 0 ? "No matches" : `${currentMatch + 1} of ${matches.length}`}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={matches.length === 0}
                  onClick={() => goToMatch(currentMatch - 1)}
                  aria-label="Previous match"
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={matches.length === 0}
                  onClick={() => goToMatch(currentMatch + 1)}
                  aria-label="Next match"
                >
                  ↓
                </Button>
              </>
            )}
          </form>
          {/* Built from `segments` and the live `speakers` state, so a copy
              always carries the corrections and names on screen. */}
          <TranscriptExport
            projectTitle={projectTitle}
            interviewDate={interviewDate}
            exportDate={exportDate}
            segments={segments}
            speakers={speakers}
          />
          <ShortcutsHelp />
        </div>

        {segments.length === 0 ? (
          <p className="text-sm text-ink-500">
            The transcript didn&apos;t come back with any speech.
          </p>
        ) : (
          <div>
            <p className="mb-2 text-xs text-ink-400">
              Select any stretch of text to make an excerpt. Use the ⋮ on a line to edit, merge, or
              reassign it.
            </p>
            <div className="relative">
              <div
                ref={transcriptRef}
                // Clearing on mousedown *here* rather than on a document-wide
                // selectionchange: focusing any form control collapses the
                // document selection, so listening globally meant clicking
                // into the clip title closed the composer you'd just opened.
                // A pending clip now survives until you touch the transcript
                // again, create it, or cancel.
                onMouseDown={() => setSelection(null)}
                onMouseUp={captureSelection}
                // Wheel and touch fire only for user-driven scrolling, never
                // for scrollIntoView — so following stops the moment the
                // reporter takes over, instead of fighting them for the pane.
                onWheel={() => setFollow(false)}
                onTouchMove={() => setFollow(false)}
                className="max-h-[max(24rem,calc(100vh-17rem))] overflow-y-auto rounded border border-line py-2 pb-24"
              >
                {segments.map((segment, index) => (
                  <SegmentRow
                    key={segment.id}
                    projectId={projectId}
                    segment={segment}
                    tokens={tokensBySegment[index] ?? []}
                    clipSpans={clipCoverage[index] ?? []}
                    selectedClipId={selectedClipId}
                    hoveredClipId={hoveredClipId}
                    speakers={speakers}
                    segmentIndex={index}
                    found={highlights.get(index)}
                    isActive={index === activeIndex}
                    isLast={index === segments.length - 1}
                    showSpeaker={
                      index === 0 || segments[index - 1]?.speakerId !== segment.speakerId
                    }
                    isEditing={editingSegmentId === segment.id}
                    onStartEditing={() => setEditingSegmentId(segment.id)}
                    onStopEditing={() => setEditingSegmentId(null)}
                    onSeek={seekTo}
                    onSelectClip={(clipId) =>
                      setSelectedClip(clipId ? { id: clipId, origin: "transcript" } : null)
                    }
                  />
                ))}
              </div>
              {selection && (
                <SelectionToolbar
                  key={`${selection.startMs}-${selection.endMs}`}
                  sourceId={sourceId}
                  representationId={representationId}
                  selection={selection}
                  onPreview={previewRange}
                  onCancel={clearSelection}
                  onCreated={() => {
                    clearSelection();
                    router.refresh();
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
        <ClipRail
          clips={clips}
          selectedClipId={selectedClipId}
          selectionOrigin={selectedClip?.origin ?? null}
          onSelect={handleSelectFromRail}
          onHover={setHoveredClipId}
          onTrimPreview={(clipId, range) =>
            setPendingTrims((current) => ({ ...current, [clipId]: range }))
          }
          onPreview={previewRange}
        />
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
