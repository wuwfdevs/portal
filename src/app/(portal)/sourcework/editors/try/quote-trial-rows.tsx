"use client";

import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { QUOTE_TIER_LABEL, formatClipRange } from "@/lib/sourcework/quotes";
import type { QuoteTrialRow, TrialQuote } from "@/lib/sourcework/quote-trials";
import { PlayIcon } from "../../[id]/transport-icons";
import { usePiecePlayer } from "../../[id]/pieces/[pieceId]/use-piece-player";

const GROUP_LABEL: Record<QuoteTrialRow["group"], string> = {
  both: "In both",
  draft_only: "Only in draft",
  live_only: "Only in live",
};

const TIER_BADGE = {
  strong: "bg-[#0F2235] text-white",
  good: "bg-brand-surface text-brand-link",
  usable: "bg-panel-100 text-ink-500",
} as const;

function Side({
  quote,
  side,
  playing,
  onPlay,
}: {
  quote: TrialQuote | null;
  side: "Live" | "Draft";
  playing: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="px-4 py-3 text-sm lg:border-r lg:border-line lg:last:border-r-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400 lg:hidden">
        {side}
      </div>
      {quote ? (
        <>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider",
                TIER_BADGE[quote.tier],
              )}
            >
              {QUOTE_TIER_LABEL[quote.tier]}
            </span>
            {quote.stance === "complicates" && (
              <span className="rounded-full bg-warning-bg px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider text-warning-fg">
                Complicates
              </span>
            )}
            <span className="text-xs text-ink-500">{quote.sourceTitle}</span>
          </div>
          <p className="font-serif text-base leading-snug text-ink-900">“{quote.text}”</p>
          <p className="mt-1 font-mono text-[11px] text-ink-400">
            {formatClipRange(quote.startMs, quote.endMs)}
          </p>
          <p className="mt-1.5 text-[13px] text-ink-700">{quote.why}</p>
          <button
            type="button"
            onClick={onPlay}
            aria-label={playing ? "Stop" : `Play the ${side.toLowerCase()} clip`}
            className="mt-2 flex h-11 w-11 items-center justify-center rounded-full border border-brand-link text-brand-link hover:bg-brand-surface lg:h-7 lg:w-7"
          >
            {playing ? (
              <span aria-hidden className="h-2.5 w-2.5 bg-current" />
            ) : (
              <PlayIcon className="ml-0.5 h-3 w-3 lg:h-2.5 lg:w-2.5" />
            )}
          </button>
        </>
      ) : (
        <span className="text-ink-400">—</span>
      )}
    </div>
  );
}

/** The aligned rows of a quote trial, each clip playable on its own. One clip plays at a time. */
export function QuoteTrialRows({ rows }: { rows: QuoteTrialRow[] }) {
  const { audioRef, play, playingKey, error } = usePiecePlayer();
  return (
    <>
      <audio ref={audioRef} preload="none" className="hidden" />
      {error && (
        <div className="p-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-500">Nothing in this group.</p>
      ) : (
        rows.map((row, index) => (
          <div
            key={index}
            className={cn(
              "border-t border-line first:border-t-0",
              row.group !== "both" && "bg-brand-surface/20",
            )}
          >
            <div className="px-4 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 lg:hidden">
              {GROUP_LABEL[row.group]}
            </div>
            <div className="grid lg:grid-cols-2">
              {(["live", "draft"] as const).map((key) => {
                const quote = row[key];
                const playKey = `${index}:${key}`;
                return (
                  <Side
                    key={key}
                    quote={quote}
                    side={key === "live" ? "Live" : "Draft"}
                    playing={playingKey === playKey}
                    onPlay={() =>
                      quote && void play(playKey, quote.sourceId, quote.startMs, quote.endMs)
                    }
                  />
                );
              })}
            </div>
          </div>
        ))
      )}
    </>
  );
}
