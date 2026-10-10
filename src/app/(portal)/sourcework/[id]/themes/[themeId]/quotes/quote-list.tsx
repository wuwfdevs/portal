"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import type { ClipRange, QuoteSuggestion } from "@/lib/sourcework/quotes";
import { usePiecePlayer } from "../../../pieces/[pieceId]/use-piece-player";
import { QuoteCard } from "./quote-card";

/**
 * The waiting suggestions, sharing one audio element so only one clip plays at a time (the piece
 * editor's player, which signs the recording's URL at the moment of play). A decided card leaves
 * the list at once; the refresh makes the counts beside it catch up.
 */
export function QuoteList({ quotes }: { quotes: QuoteSuggestion[] }) {
  const router = useRouter();
  const { audioRef, play, stop, playingKey, error } = usePiecePlayer();
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());

  const visible = quotes.filter((quote) => !decided.has(quote.id));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <audio ref={audioRef} preload="none" className="hidden" />
      {error && <Alert>{error}</Alert>}
      {visible.map((quote) => (
        <QuoteCard
          key={quote.id}
          quote={quote}
          playing={playingKey === quote.id}
          onPlay={(range: ClipRange) =>
            void play(quote.id, quote.sourceId, range.startMs, range.endMs)
          }
          onDecided={(id) => {
            if (playingKey === id) stop();
            setDecided((current) => new Set(current).add(id));
            router.refresh();
          }}
        />
      ))}
    </div>
  );
}
