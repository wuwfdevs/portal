"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  QUOTE_TIER_LABEL,
  TRIM_STEPS_MS,
  formatClipRange,
  formatClipSeconds,
  formatClipTime,
  nudgeEdge,
  type ClipRange,
  type QuoteSuggestion,
} from "@/lib/sourcework/quotes";
import { acceptQuote, rejectQuote } from "../../../../quote-actions";
import { PlayIcon } from "../../../transport-icons";

const TIER_BADGE = {
  strong: "bg-[#0F2235] text-white",
  good: "bg-brand-surface text-brand-link",
  usable: "bg-panel-100 text-ink-500",
} as const;

/**
 * One suggested clip (docs/sourcework-analysis-design.md §5.5): the tier, who says it, the words,
 * why it works, and Play / Accept / Trim / Reject. Play plays the clip as it will cut, so after a
 * trim it plays the trimmed range. Accepting writes an ordinary excerpt for that range.
 */
export function QuoteCard({
  quote,
  playing,
  onPlay,
  onDecided,
}: {
  quote: QuoteSuggestion;
  playing: boolean;
  onPlay: (range: ClipRange) => void;
  onDecided: (id: string) => void;
}) {
  const [range, setRange] = useState<ClipRange>({ startMs: quote.startMs, endMs: quote.endMs });
  const [trimming, setTrimming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = range.startMs !== quote.startMs || range.endMs !== quote.endMs;

  async function decide(work: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save that. Try again.");
      return;
    }
    onDecided(quote.id);
  }

  const accept = () =>
    decide(() =>
      acceptQuote({ suggestionId: quote.id, startMs: range.startMs, endMs: range.endMs }),
    );
  const reject = () => decide(() => rejectQuote({ suggestionId: quote.id }));

  return (
    <article
      aria-label={`${QUOTE_TIER_LABEL[quote.tier]} quote`}
      className="rounded border border-dashed border-ink-400 bg-white p-3.5"
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider",
            TIER_BADGE[quote.tier],
          )}
        >
          {QUOTE_TIER_LABEL[quote.tier]}
        </span>
        {quote.stance === "complicates" && (
          <span
            title="Every data point behind this clip pushes against the theme"
            className="rounded-full bg-warning-bg px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider text-warning-fg"
          >
            Complicates
          </span>
        )}
        <span className="text-xs text-ink-500">
          {quote.speakerName ?? quote.sourceTitle}
          <span className="lg:hidden"> · {formatClipSeconds(range.startMs, range.endMs)}</span>
        </span>
        {quote.speakerName && (
          <span className="ml-auto hidden truncate text-xs text-ink-400 sm:inline">
            {quote.sourceTitle}
          </span>
        )}
      </div>

      <p className="font-serif text-[17px] leading-snug text-ink-900 lg:text-lg">“{quote.text}”</p>
      <p className="mt-1.5 font-mono text-[11px] text-ink-400 max-lg:hidden">
        {formatClipRange(range.startMs, range.endMs)}
      </p>
      {trimmed && (
        <p className="mt-1 text-xs text-ink-500">
          Trimmed. The words are read again from the transcript when you accept.
        </p>
      )}

      <p className="mt-2 text-[13px] text-ink-700">
        <strong>Why it works.</strong> {quote.reason}
      </p>

      <div className="mt-3 flex items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => onPlay(range)}
          aria-label={playing ? "Stop" : "Play the clip as it will cut"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-link text-brand-link hover:bg-brand-surface lg:h-7 lg:w-7"
        >
          {playing ? (
            <span aria-hidden className="h-2.5 w-2.5 bg-current" />
          ) : (
            <PlayIcon className="ml-0.5 h-3 w-3 lg:h-2.5 lg:w-2.5" />
          )}
        </button>
        <Button
          type="button"
          size="sm"
          variant={quote.tier === "usable" ? "secondary" : "primary"}
          onClick={accept}
          disabled={busy}
          className="max-lg:min-h-11 max-lg:px-[18px] max-lg:text-sm"
        >
          Accept
        </Button>
        <button
          type="button"
          onClick={() => setTrimming((open) => !open)}
          aria-expanded={trimming}
          className="px-1 text-xs font-semibold text-brand-link hover:underline max-lg:min-h-11 max-lg:px-2.5 max-lg:text-sm"
        >
          Trim
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={busy}
          className="ml-auto px-1 text-xs font-semibold text-ink-400 hover:text-ink-700 hover:underline disabled:opacity-60 max-lg:min-h-11 max-lg:text-sm"
        >
          Reject
        </button>
      </div>

      {trimming && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-2.5 text-xs text-ink-500">
          {(["in", "out"] as const).map((edge) => (
            <div key={edge} className="flex flex-wrap items-center gap-2">
              <span className="w-7">{edge === "in" ? "In" : "Out"}</span>
              <span className="w-[52px] font-mono text-[11px]">
                {formatClipTime(edge === "in" ? range.startMs : range.endMs)}
              </span>
              {TRIM_STEPS_MS.map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setRange((current) => nudgeEdge(current, edge, step, null))}
                  aria-label={`Move ${edge === "in" ? "the start" : "the end"} ${step > 0 ? "later" : "earlier"} by ${Math.abs(step)} milliseconds`}
                  className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-700 hover:bg-panel-50 max-lg:min-h-11 max-lg:min-w-11 max-lg:text-sm"
                >
                  {step > 0 ? `+${step}` : `−${Math.abs(step)}`}
                </button>
              ))}
            </div>
          ))}
          {trimmed && (
            <button
              type="button"
              onClick={() => setRange({ startMs: quote.startMs, endMs: quote.endMs })}
              className="w-fit font-semibold text-brand-link hover:underline max-lg:min-h-11"
            >
              Back to the suggested cut
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  );
}
