"use client";

import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/transcription/media";
import { PauseIcon, PlayIcon } from "./transport-icons";

const SKIP_MS = 5000;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

/**
 * The persistent compact transport the design asks for (§4): play/pause,
 * time, seek, speed — plus the ±5s jump that re-hearing a phrase depends on
 * and the follow-along toggle.
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
}: {
  mediaRef: RefObject<HTMLMediaElement | null>;
  follow: boolean;
  onToggleFollow: () => void;
}) {
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);

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
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded border border-line bg-white/95 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white hover:bg-[#2278B8]"
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

      <input
        type="range"
        min={0}
        max={Math.max(durationMs, 1)}
        value={Math.min(currentMs, durationMs || currentMs)}
        onChange={(e) => {
          const el = mediaRef.current;
          if (el) el.currentTime = Number(e.target.value) / 1000;
        }}
        aria-label="Seek"
        className="h-1 min-w-[8rem] flex-1 cursor-pointer accent-[#2A8AD4]"
      />

      <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-500">
        {formatDuration(currentMs)} / {durationMs ? formatDuration(durationMs) : "—:—"}
      </span>

      <label className="flex shrink-0 items-center gap-1 text-[11px] text-ink-500">
        <span className="sr-only">Playback speed</span>
        <select
          value={rate}
          onChange={(e) => {
            const el = mediaRef.current;
            if (el) el.playbackRate = Number(e.target.value);
          }}
          className="rounded border border-line bg-white px-1 py-0.5 text-[11px] text-ink-700 focus:border-brand-primary focus:outline-none"
        >
          {PLAYBACK_RATES.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </select>
      </label>

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
          "shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors",
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
      className="rounded border border-line px-1.5 py-1 font-mono text-[11px] font-semibold text-ink-700 hover:bg-panel-50"
    >
      {children}
    </button>
  );
}
