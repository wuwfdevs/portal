"use client";

import { useSyncExternalStore } from "react";

// "Readable copy at an adjustable size" (docs/log-design.md §13) for the
// current break's items during a live broadcast. One size for the whole
// break, not one per item: every CopyDisplay reads the same module-level
// store, and the single A-/A+ control (CopySizeControl, mounted once in
// the current break's header) adjusts them all together — per-item
// controls looked like separate settings and made a multi-item break's
// text drift out of step. Resets each page load rather than persisting —
// this is used from whatever machine is in the studio at the time, not
// carried between hosts or sessions, so there's nothing meaningful to
// remember between visits.

const SIZES = ["text-lg", "text-2xl", "text-4xl"] as const;
const DEFAULT_SIZE_INDEX = 1;

let sizeIndex = DEFAULT_SIZE_INDEX;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useCopySizeIndex(): number {
  return useSyncExternalStore(
    subscribe,
    () => sizeIndex,
    () => DEFAULT_SIZE_INDEX,
  );
}

function adjustCopySize(delta: number): void {
  sizeIndex = Math.min(SIZES.length - 1, Math.max(0, sizeIndex + delta));
  for (const listener of listeners) listener();
}

/** The one A-/A+ pair for the live copy view — mount once, in the current break's header. */
export function CopySizeControl() {
  const current = useCopySizeIndex();
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Copy size</span>
      <button
        type="button"
        onClick={() => adjustCopySize(-1)}
        disabled={current === 0}
        className="rounded border border-line bg-white px-2 py-1 text-xs font-bold text-ink-700 disabled:text-ink-300"
        aria-label="Smaller copy text"
      >
        A-
      </button>
      <button
        type="button"
        onClick={() => adjustCopySize(1)}
        disabled={current === SIZES.length - 1}
        className="rounded border border-line bg-white px-2 py-1 text-xs font-bold text-ink-700 disabled:text-ink-300"
        aria-label="Larger copy text"
      >
        A+
      </button>
    </div>
  );
}

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
  const current = useCopySizeIndex();
  const size = SIZES[current]!;

  return (
    <div>
      {startLabel && (
        <p className={`${size} mb-1 font-mono font-extrabold text-brand-link tabular-nums`}>
          {startLabel}
        </p>
      )}
      <p className={`${size} font-bold text-ink-900`}>{title}</p>
      {script && <p className={`${size} mt-3 whitespace-pre-wrap leading-relaxed text-ink-900`}>{script}</p>}
      {!script && summary && <p className={`${size} mt-3 text-ink-700`}>{summary}</p>}
    </div>
  );
}
