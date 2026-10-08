"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
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
import { SpeakersMenu, SpeakersPane } from "./speakers-menu";
import { SegmentRow } from "./segment-row";
import { ClipRail, type ClipSelectionOrigin } from "./clip-rail";
import { TranscriptExport } from "./transcript-export";
import { SelectionToolbar } from "./selection-toolbar";
import { PlayerBar } from "./player-bar";
import { ShortcutsHelp } from "./shortcuts-help";

const SKIP_MS = 5000;

/** How long the selection must sit still before it is read — long enough for a drag of the handles to settle. */
const SELECTION_SETTLE_MS = 250;

type Pane = "transcript" | "excerpts" | "speakers";

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
  // Below lg the three working surfaces are tabs of one screen rather than a
  // column and a rail; from lg up all of them are on screen and this is unused.
  const [pane, setPane] = useState<Pane>("transcript");
  // Whether the pending selection came from the browser's own text selection
  // (which a tap elsewhere in the text collapses) or from "excerpt from this
  // line" (which nothing in the DOM backs).
  const selectionFromDomRef = useRef(false);
  const lineSelectionRef = useRef<number | null>(null);
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

  /** Off → on doubles as "take me back to the playhead". */
  function toggleFollow() {
    setFollow((current) => !current);
    if (!follow) scrollToActive();
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

  // Choosing an excerpt on the Excerpts tab has nothing to scroll to while the
  // transcript is hidden; returning to the Transcript tab lands on its words.
  useEffect(() => {
    if (pane !== "transcript" || selectedClip?.origin !== "rail") return;
    const start = findClipStart(clipCoverage, selectedClip.id);
    if (!start) return;
    transcriptRef.current
      ?.querySelector(
        `[data-segment-index="${start.segmentIndex}"] [data-token-index="${start.tokenIndex}"]`,
      )
      ?.scrollIntoView({ block: "center" });
    // Only on arriving at the tab, not on every later clip change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane]);

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
      selectionFromDomRef.current = false;
      lineSelectionRef.current = null;
      setSelection(null);
      return;
    }

    const range = domSelection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      selectionFromDomRef.current = false;
      lineSelectionRef.current = null;
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
    selectionFromDomRef.current = resolved !== null;
    lineSelectionRef.current = null;
    // Same range, same object: the sheet is keyed on it, and this now runs on
    // every settle of a touch selection, not just once per mouse drag.
    setSelection((current) =>
      current &&
      resolved &&
      current.startMs === resolved.startMs &&
      current.endMs === resolved.endMs
        ? current
        : resolved,
    );
    // Dragging out a new clip supersedes whichever one was open: the composer
    // takes the panel anyway, and leaving the old clip tinted underneath a
    // fresh selection makes it ambiguous which words are about to be cut.
    if (resolved) setSelectedClip(null);
  }, [tokensBySegment]);

  /**
   * The same selection, read for touch. A long-press-and-drag never fires
   * `mouseup`, so reading the selection there left a phone with no way to make
   * an excerpt at all; `selectionchange` is the event both mouse and touch
   * produce, settled for a moment because a drag of the handles fires it
   * continuously.
   *
   * It only ever *sets* a selection, or clears one the browser itself made
   * once a tap inside the text collapses it. A selection that moved outside
   * the transcript is ignored on purpose: focusing the excerpt title moves the
   * browser's selection into the input, and that must not close the sheet
   * you are typing in.
   */
  useEffect(() => {
    let timer: number | undefined;
    function onSelectionChange() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const root = transcriptRef.current;
        const domSelection = window.getSelection();
        if (!root || !domSelection || domSelection.rangeCount === 0) return;
        const insideRoot = root.contains(domSelection.getRangeAt(0).commonAncestorContainer);
        if (!insideRoot) return;
        if (domSelection.isCollapsed) {
          if (selectionFromDomRef.current) {
            selectionFromDomRef.current = false;
            setSelection(null);
          }
          return;
        }
        captureSelection();
      }, SELECTION_SETTLE_MS);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [captureSelection]);

  /** One whole line as the pending excerpt — what "Make an excerpt from this line" does. */
  function makeExcerptFromLine(segmentIndex: number) {
    const tokens = tokensBySegment[segmentIndex] ?? [];
    const resolved = resolveSelection(
      tokensBySegment,
      tokens.map((_, tokenIndex) => ({ segmentIndex, tokenIndex })),
    );
    if (!resolved) return;
    window.getSelection()?.removeAllRanges();
    selectionFromDomRef.current = false;
    lineSelectionRef.current = segmentIndex;
    setSelectedClip(null);
    setSelection(resolved);
  }

  // On a phone the sheet covers the lower part of the screen. Bring the words
  // being cut up above it, or the reporter is naming a quote they can't see.
  useEffect(() => {
    if (!selection || !window.matchMedia("(max-width: 1023px)").matches) return;
    const frame = requestAnimationFrame(() => {
      const sheet = document.querySelector<HTMLElement>(
        '[role="toolbar"][aria-label="Make an excerpt"]',
      );
      if (!sheet) return;
      const domSelection = window.getSelection();
      const lineIndex = lineSelectionRef.current;
      const target =
        lineIndex !== null
          ? transcriptRef.current?.querySelector(`[data-segment-index="${lineIndex}"]`)
          : domSelection && domSelection.rangeCount > 0 && !domSelection.isCollapsed
            ? domSelection.getRangeAt(0)
            : null;
      if (!target) return;
      const overlap =
        target.getBoundingClientRect().bottom - (sheet.getBoundingClientRect().top - 12);
      if (overlap > 0) window.scrollBy({ top: overlap, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selection]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    selectionFromDomRef.current = false;
    lineSelectionRef.current = null;
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
    <div
      className={cn(
        "grid grid-cols-1 gap-6 pb-[calc(var(--player-dock-h,7rem)+1rem)] lg:grid-cols-[minmax(0,1fr)_300px] lg:pb-0",
        // Room to scroll the selected words clear of the excerpt sheet.
        selection && "max-lg:pb-[calc(var(--player-dock-h,7rem)+20rem)]",
      )}
    >
      <PaneTabs
        pane={pane}
        onChange={setPane}
        excerptCount={clips.length}
        speakerCount={speakers.length}
      />
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
          onToggleFollow={toggleFollow}
        />

        <div className={cn("flex-col gap-4", pane === "transcript" ? "flex" : "hidden lg:flex")}>
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
              className="flex w-full items-center gap-1.5 lg:w-auto"
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
                className="min-w-0 flex-1 px-2.5 py-1.5 lg:w-52 lg:flex-none"
              />
              {findQuery.trim().length >= 2 && (
                <>
                  <span className="whitespace-nowrap text-xs text-ink-500" aria-live="polite">
                    {matches.length === 0
                      ? "No matches"
                      : `${currentMatch + 1} of ${matches.length}`}
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
            {/* The docked player has no room for this, so on a phone it lives
                with the transcript it controls. */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-pressed={follow}
              onClick={toggleFollow}
              className={cn(
                "ml-auto min-h-11 px-4 lg:hidden",
                follow && "border-brand-primary text-brand-link",
              )}
            >
              {follow ? "Following" : "Follow"}
            </Button>
            <span className="max-lg:hidden">
              <ShortcutsHelp />
            </span>
          </div>

          {segments.length === 0 ? (
            <p className="text-sm text-ink-500">
              The transcript didn&apos;t come back with any speech.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-xs text-ink-400">
                Select any stretch of text to make an excerpt — on a phone, touch and hold a word,
                then drag. Use the ⋮ on a line to edit, merge, or reassign it, or to make an excerpt
                from the whole line.
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
                  className="max-h-[max(20rem,calc(100dvh-22rem))] overflow-y-auto py-2 pb-24 lg:rounded lg:border lg:border-line lg:max-h-[max(24rem,calc(100vh-17rem))]"
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
                      onMakeExcerpt={() => makeExcerptFromLine(index)}
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
      </div>

      <div className={cn(pane === "speakers" ? "lg:hidden" : "hidden")}>
        <SpeakersPane
          projectId={projectId}
          speakers={speakers}
          segments={segments}
          onSeek={seekTo}
          onRenamed={handleSpeakerRenamed}
        />
      </div>

      <div
        className={cn(
          "flex-col gap-4 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto",
          pane === "excerpts" ? "flex" : "hidden",
        )}
      >
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
          onShowInTranscript={() => setPane("transcript")}
        />
      </div>
    </div>
  );
}

/**
 * The three working surfaces as tabs, below lg only. Buttons rather than the
 * link-based TabNav, because these switch what one screen shows and are not
 * places in the tool; the underline is the same, since it answers the same
 * question.
 */
function PaneTabs({
  pane,
  onChange,
  excerptCount,
  speakerCount,
}: {
  pane: Pane;
  onChange: (pane: Pane) => void;
  excerptCount: number;
  speakerCount: number;
}) {
  const tabs: { id: Pane; label: string; count?: number }[] = [
    { id: "transcript", label: "Transcript" },
    { id: "excerpts", label: "Excerpts", count: excerptCount },
    { id: "speakers", label: "Speakers", count: speakerCount },
  ];
  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className="-mb-2 flex border-b border-line lg:hidden"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={pane === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "-mb-px flex min-h-12 flex-1 items-center justify-center gap-1.5 border-b-[3px] text-[15px] font-semibold transition-colors",
            pane === tab.id
              ? "border-brand-primary text-brand-link"
              : "border-transparent text-ink-500",
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="rounded-full bg-panel-100 px-1.5 text-xs font-bold leading-5 text-ink-700">
              {tab.count}
            </span>
          )}
        </button>
      ))}
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
