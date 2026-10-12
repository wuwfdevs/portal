"use client";

import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/transcription/media";
import { NUDGE_STEPS_MS, clampTrim } from "@/lib/sourcework/pieces";
import { contextForRange, retrimByToken, type TextSegment } from "@/lib/sourcework/piece-text";
import { PlayIcon } from "@/app/(portal)/sourcework/[id]/transport-icons";

export interface TrimRange {
  startMs: number;
  endMs: number;
}

/**
 * The one trim control for an excerpt, shared by the pieces editor's trim panel and the
 * transcript screen's excerpt rail: the clip's words in their transcript context (tap a word
 * to move the nearer end there), In/Out readouts with nudge chips, and Play as cut.
 *
 * It is controlled and does no saving. The owner decides what a change means (a piece's own
 * trim, or the excerpt itself) and passes in the range it currently holds.
 */
export function ExcerptTrimEditor({
  range,
  speaker,
  segments,
  loadingContext = false,
  sourceDurationMs,
  onChange,
  onPlay,
  playing = false,
  children,
}: {
  range: TrimRange;
  speaker?: string | null;
  /** The transcript around the clip; undefined until loaded, and the words are skipped without it. */
  segments: TextSegment[] | undefined;
  loadingContext?: boolean;
  sourceDurationMs: number | null;
  /** The next range, already clamped. */
  onChange: (next: TrimRange) => void;
  onPlay?: (range: TrimRange) => void;
  playing?: boolean;
  /** Owner-specific controls below the nudges (the piece panel's scope switch and save status). */
  children?: ReactNode;
}) {
  const tokens = useMemo(
    () => (segments ? contextForRange(segments, range.startMs, range.endMs) : []),
    [segments, range.startMs, range.endMs],
  );

  function apply(next: TrimRange) {
    const clamped = clampTrim(next.startMs, next.endMs, sourceDurationMs);
    onChange({ startMs: clamped.inMs, endMs: clamped.outMs });
  }

  function nudge(field: "start" | "end", delta: number) {
    apply(
      field === "start"
        ? { startMs: range.startMs + delta, endMs: range.endMs }
        : { startMs: range.startMs, endMs: range.endMs + delta },
    );
  }

  return (
    <div>
      <p className="mb-2 text-[13px] text-ink-500">
        {[speaker, `${formatDuration(range.startMs)}–${formatDuration(range.endMs)}`]
          .filter(Boolean)
          .join(" · ")}{" "}
        · {Math.round((range.endMs - range.startMs) / 1000)}s
      </p>

      {tokens.length > 0 ? (
        <p className="font-serif text-base leading-relaxed text-ink-400 max-lg:text-[17px] max-lg:leading-[1.7]">
          {tokens.map((token, index) => (
            <span key={`${token.startMs}-${index}`}>
              <button
                type="button"
                onClick={() => apply(retrimByToken(token, range))}
                className={
                  token.inRange
                    ? "border-b-2 border-clipped-line bg-clipped-selected text-ink-900"
                    : "hover:text-ink-700"
                }
              >
                {token.text}
              </button>{" "}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-sm text-ink-500">
          {loadingContext
            ? "Loading the transcript around this clip…"
            : "The transcript words aren’t available for this clip. Use the buttons below."}
        </p>
      )}
      <p className="mt-1.5 text-xs text-ink-400">
        Tap a word to move the start or end there, or nudge below.
      </p>

      <div className="mt-2.5 flex flex-col gap-2 text-xs text-ink-500 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-7 lg:gap-y-2">
        <TrimRow label="In" valueMs={range.startMs} onNudge={(delta) => nudge("start", delta)} />
        <TrimRow label="Out" valueMs={range.endMs} onNudge={(delta) => nudge("end", delta)} />
        {onPlay && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPlay(range)}
            className="gap-2 max-lg:min-h-11 lg:ml-auto"
          >
            <PlayIcon className="h-2.5 w-2.5" />
            {playing ? "Stop" : "Play as cut"}
          </Button>
        )}
      </div>

      {children}
    </div>
  );
}

function TrimRow({
  label,
  valueMs,
  onNudge,
}: {
  label: string;
  valueMs: number;
  onNudge: (deltaMs: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 font-semibold text-ink-700">{label}</span>
      <span className="w-14 font-mono text-ink-900">{formatDuration(valueMs)}</span>
      <div className="flex flex-1 gap-1 lg:flex-none">
        {NUDGE_STEPS_MS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => onNudge(step)}
            aria-label={`Move ${label.toLowerCase()} point ${step > 0 ? "later" : "earlier"} by ${Math.abs(step)} milliseconds`}
            className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-700 hover:bg-panel-50 max-lg:min-h-11 max-lg:flex-1 max-lg:text-xs"
          >
            {step > 0 ? `+${step}` : step}
          </button>
        ))}
      </div>
    </div>
  );
}
