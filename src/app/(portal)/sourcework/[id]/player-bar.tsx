"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import {
  mergeMarks,
  zoomWindowForBin,
  type RangeLike,
  type ScrubberWindow,
} from "@/lib/transcription/scrubber-marks";
import { PauseIcon, PlayIcon } from "./transport-icons";

const SKIP_MS = 5000;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

/**
 * The persistent compact transport the design asks for (§4): play/pause,
 * time, seek, speed — plus the ±5s jump that re-hearing a phrase depends on
 * and the follow-along toggle.
 *
 * On a phone it is docked to the bottom of the screen instead of the top of the
 * column, so it stays reachable by thumb whichever workspace tab is open. It
 * publishes its own height as `--player-dock-h` on the root element, which is
 * what lets the excerpt sheet sit exactly above it and the page leave room
 * for it, without either guessing a number.
 *
 * It drives the media element the workspace owns, and subscribes to that
 * element for its own display state rather than having the workspace hold
 * the current time. That keeps a four-times-a-second `timeupdate` from
 * re-rendering every line of the transcript.
 */
export function PlayerBar({
  mediaRef,
  follow,
  onToggleFollow,
  marks = [],
  onSelectMark,
}: {
  mediaRef: RefObject<HTMLMediaElement | null>;
  follow: boolean;
  onToggleFollow: () => void;
  /** Where the saved excerpts sit, drawn under the scrubber. */
  marks?: (RangeLike & { title: string })[];
  /** A click on one excerpt's mark (not on a merged stretch). */
  onSelectMark?: (clipId: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  // The stretch of the recording the scrubber covers. Null is all of it; a
  // click on a density stripe narrows it until the excerpts inside can be
  // told apart (see zoomWindowForBin).
  const [zoom, setZoom] = useState<ScrubberWindow | null>(null);
  const view: ScrubberWindow = useMemo(
    () => zoom ?? { startMs: 0, endMs: durationMs },
    [zoom, durationMs],
  );

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const syncTime = () => setCurrentMs(el.currentTime * 1000);
    const syncDuration = () => setDurationMs(Number.isFinite(el.duration) ? el.duration * 1000 : 0);
    const syncPlaying = () => setIsPlaying(!el.paused);
    const syncRate = () => setRate(el.playbackRate);

    el.addEventListener("timeupdate", syncTime);
    el.addEventListener("seeked", syncTime);
    el.addEventListener("durationchange", syncDuration);
    el.addEventListener("loadedmetadata", syncDuration);
    el.addEventListener("play", syncPlaying);
    el.addEventListener("pause", syncPlaying);
    el.addEventListener("ratechange", syncRate);

    // The element may already be loaded and playing by the time this runs.
    syncTime();
    syncDuration();
    syncPlaying();
    syncRate();

    return () => {
      el.removeEventListener("timeupdate", syncTime);
      el.removeEventListener("seeked", syncTime);
      el.removeEventListener("durationchange", syncDuration);
      el.removeEventListener("loadedmetadata", syncDuration);
      el.removeEventListener("play", syncPlaying);
      el.removeEventListener("pause", syncPlaying);
      el.removeEventListener("ratechange", syncRate);
    };
  }, [mediaRef]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const publish = () =>
      document.documentElement.style.setProperty("--player-dock-h", `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--player-dock-h");
    };
  }, []);

  function togglePlay() {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  function skip(deltaMs: number) {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, el.currentTime + deltaMs / 1000);
  }

  return (
    <div
      ref={barRef}
      className={cn(
        // Below lg: docked to the bottom edge, clear of the home indicator.
        "fixed inset-x-0 bottom-0 z-30 flex flex-nowrap items-center gap-1.5 border-t border-line bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_14px_rgba(15,20,25,0.07)]",
        // lg and up: the sticky bar at the top of the transcript column.
        "lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-0 lg:z-10 lg:flex-wrap lg:gap-3 lg:rounded lg:border lg:bg-white/95 lg:py-2 lg:pb-2 lg:shadow-none lg:backdrop-blur",
      )}
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white hover:bg-[#2278B8] lg:h-8 lg:w-8"
      >
        {isPlaying ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="ml-0.5 h-3 w-3" />}
      </button>

      <div className="flex shrink-0 gap-1">
        <TransportButton onClick={() => skip(-SKIP_MS)} label="Back 5 seconds">
          −5s
        </TransportButton>
        <TransportButton onClick={() => skip(SKIP_MS)} label="Forward 5 seconds">
          +5s
        </TransportButton>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:min-w-[8rem] lg:gap-1">
        <input
          type="range"
          min={view.startMs}
          max={Math.max(view.endMs, view.startMs + 1)}
          value={Math.min(
            Math.max(currentMs, view.startMs),
            Math.max(view.endMs, view.startMs + 1),
          )}
          onChange={(e) => {
            const el = mediaRef.current;
            if (el) el.currentTime = Number(e.target.value) / 1000;
          }}
          aria-label="Seek"
          className="h-6 w-full cursor-pointer accent-[#2A8AD4] lg:h-1"
        />
        <ScrubberStrip
          marks={marks}
          durationMs={durationMs}
          view={view}
          onSelectMark={onSelectMark}
          onZoomBin={(bin) => {
            const next = zoomWindowForBin(bin, view);
            if (next) {
              setZoom(next);
              return;
            }
            // Already as narrow as a click can make it: just go there.
            const el = mediaRef.current;
            if (el) el.currentTime = bin.startMs / 1000;
          }}
        />
        <div className="flex justify-between font-mono text-[11px] tabular-nums text-ink-500 lg:hidden">
          <span>{formatDuration(currentMs)}</span>
          <span>{durationMs ? formatDuration(durationMs) : "—:—"}</span>
        </div>
        {zoom && (
          <div className="flex items-center gap-2 text-[11px] text-ink-500">
            <span>
              Showing {formatDuration(zoom.startMs)}–{formatDuration(zoom.endMs)}
            </span>
            <button
              type="button"
              onClick={() => setZoom(null)}
              className="font-semibold text-brand-link hover:underline"
            >
              Show the whole recording
            </button>
          </div>
        )}
      </div>

      <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-ink-500 lg:inline">
        {formatDuration(currentMs)} / {durationMs ? formatDuration(durationMs) : "—:—"}
      </span>

      <label className="flex shrink-0 items-center gap-1 text-[11px] text-ink-500 max-lg:hidden">
        <span className="sr-only">Playback speed</span>
        <Select
          compact
          value={rate}
          onChange={(e) => {
            const el = mediaRef.current;
            if (el) el.playbackRate = Number(e.target.value);
          }}
          className="text-ink-700"
        >
          {PLAYBACK_RATES.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </Select>
      </label>

      <button
        type="button"
        onClick={() => {
          const el = mediaRef.current;
          if (!el) return;
          const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length];
          el.playbackRate = next ?? 1;
        }}
        aria-label={`Playback speed ${rate}×. Change speed.`}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded border border-line px-1 text-sm font-semibold text-ink-700 lg:hidden"
      >
        {rate}×
      </button>

      <button
        type="button"
        onClick={onToggleFollow}
        aria-pressed={follow}
        title={
          follow
            ? "The transcript is scrolling with playback"
            : "Scroll the transcript back to the playhead and follow along"
        }
        className={cn(
          "shrink-0 rounded border px-3 text-sm font-semibold transition-colors max-lg:hidden lg:px-2 lg:py-0.5 lg:text-[11px]",
          follow
            ? "border-brand-primary bg-brand-surface text-brand-link"
            : "border-line text-ink-500 hover:bg-panel-50",
        )}
      >
        {follow ? "Following" : "Jump to playhead"}
      </button>
    </div>
  );
}

function TransportButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded border border-line px-1.5 py-1 font-mono text-[11px] font-semibold text-ink-700 hover:bg-panel-50 max-lg:min-h-11 max-lg:min-w-10 max-lg:px-0"
    >
      {children}
    </button>
  );
}

/**
 * The strip of excerpt marks under the scrubber: one mark per excerpt while
 * there are few, a density strip once there are many (see mergeMarks). It
 * answers "which stretches of this recording have I already mined?" at a
 * glance, and a mark is a button that opens that excerpt.
 */
function ScrubberStrip({
  marks,
  durationMs,
  view,
  onSelectMark,
  onZoomBin,
}: {
  marks: (RangeLike & { title: string })[];
  durationMs: number;
  view: ScrubberWindow;
  onSelectMark?: (clipId: string) => void;
  onZoomBin: (bin: { startMs: number; endMs: number }) => void;
}) {
  const merged = useMemo(
    () => mergeMarks(marks, durationMs, { window: view }),
    [marks, durationMs, view],
  );
  const titleById = useMemo(() => new Map(marks.map((mark) => [mark.id, mark.title])), [marks]);
  if (marks.length === 0 || durationMs <= 0) return null;

  return (
    <div className="relative h-2.5" aria-label={`${marks.length} excerpts on the recording`}>
      {merged.mode === "marks"
        ? merged.marks.map((mark) => (
            <button
              key={mark.id}
              type="button"
              onClick={() => onSelectMark?.(mark.id)}
              title={titleById.get(mark.id)}
              aria-label={`Excerpt: ${titleById.get(mark.id) ?? ""}`}
              className="absolute inset-y-0 rounded-sm bg-clipped-line hover:brightness-90"
              style={{ left: `${mark.left}%`, width: `${mark.width}%` }}
            />
          ))
        : merged.bins.map((bin) =>
            bin.count === 0 ? null : (
              <button
                key={bin.left}
                type="button"
                onClick={() => onZoomBin(bin)}
                title={`${bin.count} excerpt${bin.count === 1 ? "" : "s"} here. Select to zoom in.`}
                aria-label={`${bin.count} excerpts from ${formatDuration(bin.startMs)} to ${formatDuration(bin.endMs)}. Zoom in.`}
                className="absolute inset-y-0 bg-clipped-line"
                style={{
                  left: `${bin.left}%`,
                  width: `${bin.width}%`,
                  opacity: 0.25 + bin.intensity * 0.75,
                }}
              />
            ),
          )}
    </div>
  );
}
