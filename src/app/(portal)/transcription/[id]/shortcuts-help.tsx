"use client";

import { useState } from "react";

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / pause"],
  ["J / L", "Back / forward 5 seconds"],
  ["K", "Pause"],
  ["↑ / ↓", "Previous / next line"],
  ["E", "Edit the current line"],
  ["C", "Name the excerpt you just selected"],
];

/** Keyboard shortcuts are only useful if they're discoverable. */
export function ShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        title="Keyboard shortcuts"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[11px] font-bold text-ink-500 hover:bg-panel-50"
      >
        ?
      </button>

      {isOpen && (
        <div className="absolute right-0 top-7 z-30 w-60 rounded border border-line bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Keyboard shortcuts
          </p>
          <dl className="flex flex-col gap-1.5">
            {SHORTCUTS.map(([key, description]) => (
              <div key={key} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 rounded bg-panel-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
                  {key}
                </dt>
                <dd className="text-right text-[11px] text-ink-500">{description}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-ink-400">
            Shortcuts pause while you&apos;re typing in a line.
          </p>
        </div>
      )}
    </div>
  );
}
