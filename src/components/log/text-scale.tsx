"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// A whole-screen text-size control for the rundown/console screen — as of
// 2026-08-24 THE text-size control, full stop: it is how
// docs/log-design.md §13's "readable copy at an adjustable size" is met.
// (The current break used to also render through its own larger-type
// CopyDisplay with separate A-/A+ buttons; two independent size systems on
// one screen read as needlessly complicated, so that was removed — the
// host adjusts here and everything scales together.) Persisted per browser
// via localStorage, not per host — the studio's own screen and a host's
// seating distance from it are physical facts about *that room*, not about
// who's on shift, so remembering the choice across visits is the right
// call.
//
// Applied via CSS `zoom` (TextScaleZoom below), not by swapping every
// component's Tailwind text-size class: zoom scales an entire subtree —
// including sticky positioning and layout — uniformly, without the
// rem-vs-parent-font-size mismatch a container font-size would hit against
// Tailwind's rem-based text utilities. Broad support across Chromium/WebKit
// and Firefox 126+ is enough for a tool run from a small, known set of
// studio/office machines; on an older engine this is simply a no-op, not a
// break.

const STORAGE_KEY = "log-text-scale";

export const TEXT_SCALES = {
  normal: { label: "Normal", zoom: 1 },
  large: { label: "Large", zoom: 1.2 },
  xlarge: { label: "Extra large", zoom: 1.45 },
} as const;

export type TextScaleKey = keyof typeof TEXT_SCALES;

function isTextScaleKey(value: string | null): value is TextScaleKey {
  return value === "normal" || value === "large" || value === "xlarge";
}

const TextScaleContext = createContext<{
  scale: TextScaleKey;
  setScale: (scale: TextScaleKey) => void;
} | null>(null);

export function TextScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<TextScaleKey>("normal");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the host's saved preference after mount; localStorage isn't available during SSR, so this can't be a lazy useState initializer.
    if (isTextScaleKey(stored)) setScaleState(stored);
  }, []);

  function setScale(next: TextScaleKey) {
    setScaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return <TextScaleContext.Provider value={{ scale, setScale }}>{children}</TextScaleContext.Provider>;
}

function useTextScale() {
  const context = useContext(TextScaleContext);
  if (!context) throw new Error("useTextScale must be used within a TextScaleProvider");
  return context;
}

/** Wraps a subtree so its text — and everything else in it — scales with the host's chosen text size. */
export function TextScaleZoom({ children }: { children: ReactNode }) {
  const { scale } = useTextScale();
  return <div style={{ zoom: TEXT_SCALES[scale].zoom }}>{children}</div>;
}

/**
 * The "tucked away" settings pane itself — a small disclosure, matching this
 * screen's existing <details> menus (the item card's ⋮ menu, "Full
 * forecast") rather than introducing a new interaction pattern. Deliberately
 * placed outside whatever it controls (see rundown-live-layout.tsx), so
 * adjusting the scale never resizes the control itself out from under the
 * host's cursor.
 */
export function TextScaleControl() {
  const { scale, setScale } = useTextScale();

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded border border-line px-2.5 py-1 text-xs font-bold text-ink-700 hover:bg-panel-50 [&::-webkit-details-marker]:hidden">
        Text size: {TEXT_SCALES[scale].label}
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex w-40 flex-col gap-1 rounded border border-line bg-white p-1 shadow-md">
        {(Object.keys(TEXT_SCALES) as TextScaleKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={(event) => {
              setScale(key);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
            className={cn(
              "rounded px-2 py-1.5 text-left text-xs font-semibold",
              scale === key ? "bg-brand-surface text-brand-link" : "text-ink-700 hover:bg-panel-50",
            )}
          >
            {TEXT_SCALES[key].label}
          </button>
        ))}
      </div>
    </details>
  );
}
