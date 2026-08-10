"use client";

import { useState } from "react";

// "Readable copy at an adjustable size" (docs/log-design.md §13) for the
// current break's items during a live broadcast. Resets each page load
// rather than persisting — this is used from whatever machine is in the
// studio at the time, not carried between hosts or sessions, so there's
// nothing meaningful to remember between visits.

const SIZES = ["text-lg", "text-2xl", "text-4xl"] as const;

export function CopyDisplay({
  title,
  script,
  summary,
  startLabel,
}: {
  title: string;
  script: string | null;
  summary: string | null;
  /** Pre-formatted hh:mm:ss station-clock label (formatStationClockTime) — null when this item's timing couldn't be computed. */
  startLabel: string | null;
}) {
  const [sizeIndex, setSizeIndex] = useState(1);

  function adjust(delta: number) {
    setSizeIndex((current) => Math.min(SIZES.length - 1, Math.max(0, current + delta)));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Copy</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => adjust(-1)}
            disabled={sizeIndex === 0}
            className="rounded border border-line px-2 py-1 text-xs font-bold text-ink-700 disabled:text-ink-300"
            aria-label="Smaller text"
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => adjust(1)}
            disabled={sizeIndex === SIZES.length - 1}
            className="rounded border border-line px-2 py-1 text-xs font-bold text-ink-700 disabled:text-ink-300"
            aria-label="Larger text"
          >
            A+
          </button>
        </div>
      </div>
      {startLabel && (
        <p className={`${SIZES[sizeIndex]} mb-1 font-mono font-extrabold text-brand-link tabular-nums`}>
          {startLabel}
        </p>
      )}
      <p className={`${SIZES[sizeIndex]} font-bold text-ink-900`}>{title}</p>
      {script && <p className={`${SIZES[sizeIndex]} mt-3 whitespace-pre-wrap leading-relaxed text-ink-900`}>{script}</p>}
      {!script && summary && <p className={`${SIZES[sizeIndex]} mt-3 text-ink-700`}>{summary}</p>}
    </div>
  );
}
