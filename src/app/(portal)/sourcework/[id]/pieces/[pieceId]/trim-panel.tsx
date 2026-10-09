"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatDuration } from "@/lib/transcription/media";
import {
  NUDGE_STEPS_MS,
  actualityRange,
  clampTrim,
  type ActualityBlock,
} from "@/lib/sourcework/pieces";
import { contextForRange, retrimByToken, type TextSegment } from "@/lib/sourcework/piece-text";
import type { PieceExcerpt } from "@/lib/sourcework/piece-queries";
import { updateClipTrim } from "../../clip-actions";
import { loadTrimContext } from "../actions";
import { PlayIcon } from "../../transport-icons";

type Scope = "piece" | "everywhere";

const EXCERPT_COMMIT_DELAY_MS = 400;

/**
 * Trim an actuality in place (design §6.2): the clip's words in their
 * transcript context, tap a word to move the nearer end there, or nudge with
 * the −250 −50 +50 +250 chips. By default the trim belongs to this piece only
 * (the block's own in/out); the switch changes the excerpt itself and says how
 * many other pieces use it.
 */
export function TrimPanel({
  pieceId,
  block,
  excerpt,
  segments,
  onSegments,
  onTrimPiece,
  onExcerptChanged,
  onPlay,
  playing,
  onClose,
}: {
  pieceId: string;
  block: ActualityBlock;
  excerpt: PieceExcerpt;
  segments: TextSegment[] | undefined;
  onSegments: (segments: TextSegment[]) => void;
  /** Set this block's own trim (null returns it to the excerpt's points). */
  onTrimPiece: (trim: { inMs: number; outMs: number } | null) => void;
  /** The excerpt itself moved: update every block that shows it. */
  onExcerptChanged: (startMs: number, endMs: number) => void;
  onPlay: (startMs: number, endMs: number) => void;
  playing: boolean;
  onClose: () => void;
}) {
  const initial = actualityRange(block, excerpt)!;
  const [range, setRange] = useState(initial);
  const [scope, setScope] = useState<Scope>("piece");
  const [otherPieces, setOtherPieces] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(segments === undefined);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(commitTimer.current ?? undefined), []);

  // The transcript around the clip, and how many other pieces use it.
  useEffect(() => {
    let cancelled = false;
    loadTrimContext({ pieceId, excerptId: excerpt.id }).then((result) => {
      if (cancelled) return;
      setLoadingContext(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOtherPieces(result.otherPieces);
      onSegments(result.segments);
    });
    return () => {
      cancelled = true;
    };
    // Loaded once per open panel; the callbacks are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId, excerpt.id]);

  const tokens = useMemo(
    () => (segments ? contextForRange(segments, range.startMs, range.endMs) : []),
    [segments, range.startMs, range.endMs],
  );

  function apply(next: { startMs: number; endMs: number }) {
    const clamped = clampTrim(next.startMs, next.endMs, excerpt.sourceDurationMs);
    const value = { startMs: clamped.inMs, endMs: clamped.outMs };
    setRange(value);
    setError(null);
    if (scope === "piece") {
      onTrimPiece({ inMs: value.startMs, outMs: value.endMs });
      return;
    }
    // Changing the excerpt is a write per pause, not per tap — same
    // hold-the-button pattern as the excerpt rail's own trim.
    onTrimPiece(null);
    clearTimeout(commitTimer.current ?? undefined);
    commitTimer.current = setTimeout(async () => {
      const result = await updateClipTrim({
        clipId: excerpt.id,
        startMs: value.startMs,
        endMs: value.endMs,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRange({ startMs: result.startMs, endMs: result.endMs });
      onExcerptChanged(result.startMs, result.endMs);
    }, EXCERPT_COMMIT_DELAY_MS);
  }

  function nudge(field: "start" | "end", delta: number) {
    apply(
      field === "start"
        ? { startMs: range.startMs + delta, endMs: range.endMs }
        : { startMs: range.startMs, endMs: range.endMs + delta },
    );
  }

  return (
    <div className="rounded border border-brand-primary bg-white p-4 shadow-[0_0_0_2px_#D5EAF6]">
      <div className="mb-2.5 flex items-center">
        <span className="flex-1 text-[13px] font-bold">
          Trim this clip <span className="font-normal text-ink-400">· from ⋮ › Trim…</span>
        </span>
        <Button
          type="button"
          variant="link"
          onClick={onClose}
          className="text-brand-link max-lg:min-h-11"
        >
          Done
        </Button>
      </div>

      <p className="mb-2 text-[13px] text-ink-500">
        {[excerpt.speaker, `${formatDuration(range.startMs)}–${formatDuration(range.endMs)}`]
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

      <div className="mt-2.5 flex flex-col gap-2 text-xs text-ink-500 lg:flex-row lg:flex-wrap lg:items-center lg:gap-7">
        <TrimRow label="In" valueMs={range.startMs} onNudge={(delta) => nudge("start", delta)} />
        <TrimRow label="Out" valueMs={range.endMs} onNudge={(delta) => nudge("end", delta)} />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onPlay(range.startMs, range.endMs)}
          className="gap-2 max-lg:min-h-11 lg:ml-auto"
        >
          <PlayIcon className="h-2.5 w-2.5" />
          {playing ? "Stop" : "Play as cut"}
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-2.5 lg:flex-row lg:items-center lg:gap-3.5">
        <Segmented
          name={`trim-scope-${block.id}`}
          options={[
            { value: "piece", label: "Only in this piece" },
            { value: "everywhere", label: "Update the excerpt everywhere" },
          ]}
          value={scope}
          onChange={setScope}
        />
        <span className="text-xs text-ink-400">
          {otherPieces === null
            ? "Piece length updates as you trim."
            : otherPieces === 0
              ? "No other piece uses this excerpt. The length above updates as you trim."
              : `The excerpt is also used in ${otherPieces} other ${otherPieces === 1 ? "piece" : "pieces"}. The length above updates as you trim.`}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
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
