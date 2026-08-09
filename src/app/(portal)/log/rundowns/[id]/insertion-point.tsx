"use client";

// The block-editor-style "add something here" affordance: a slim control
// between items (and before the first / after the last) in a break, rather
// than one dropdown-and-button pinned to the break's bottom. Subsumes what
// used to be the separate "Add…" <select> and the "Create a one-off live
// read" <details> — both are now just modes of the same insertion point,
// reachable from anywhere in the break, not only its end.
//
// Low-visual-weight by default (opacity-0, shown on hover/focus) but never
// hover-only in the sense that matters: it's a real, always-present,
// keyboard-focusable, tappable button regardless of pointer type — hover
// only changes its resting opacity on a device that has hover at all.
// Touch and keyboard users reach it exactly the same way as a plain button
// they haven't hovered yet.
//
// A search box over the eligible-content list rather than a <select>,
// since a <select> stops working once a break's eligible content runs to
// hundreds of items — see CLAUDE.md's log design notes on this screen.

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { WEATHER_ITEM_SENTINEL } from "@/lib/log/content-library";
import { fillRundownItem } from "../../rundown-actions";
import { LiveReadForm, type NprLookaheadItem } from "./live-read-form";

export interface InsertConfig {
  rundownId: string;
  breakId: string;
  eligibleContent: { id: string; title: string }[];
  permitsWeather: boolean;
  nprItems: NprLookaheadItem[];
}

export function InsertionPoint({
  config,
  beforeItemId,
}: {
  config: InsertConfig;
  beforeItemId: string | null;
}) {
  // Nothing eligible to search for (an empty content library, or a break
  // that only permits weather and this one already has it) — a live read is
  // always possible, so open straight into that mode instead of showing a
  // dead-end empty search box.
  const canSearch = config.permitsWeather || config.eligibleContent.length > 0;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "live_read">(canSearch ? "search" : "live_read");
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingContentItemId, setPendingContentItemId] = useState("");

  function pick(contentItemId: string) {
    setPendingContentItemId(contentItemId);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  if (!open) {
    return (
      <li className="group relative flex h-3 items-center justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Insert content here"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-line text-xs leading-none text-ink-400 opacity-0 transition-opacity hover:border-brand-primary hover:text-brand-primary focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-surface group-hover:opacity-100"
        >
          +
        </button>
      </li>
    );
  }

  const filtered = config.eligibleContent.filter((candidate) =>
    candidate.title.toLowerCase().includes(query.toLowerCase()),
  );
  const showsWeather = config.permitsWeather && "weather".includes(query.toLowerCase().trim());

  return (
    <li className="rounded border border-dashed border-brand-primary bg-brand-surface/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("search")}
            className={`rounded px-2 py-1 text-xs font-bold ${mode === "search" ? "bg-white text-brand-link" : "text-ink-500"}`}
          >
            Add content
          </button>
          <button
            type="button"
            onClick={() => setMode("live_read")}
            className={`rounded px-2 py-1 text-xs font-bold ${mode === "live_read" ? "bg-white text-brand-link" : "text-ink-500"}`}
          >
            Create live read
          </button>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="rounded px-1.5 text-xs font-bold text-ink-500 hover:bg-white"
        >
          ×
        </button>
      </div>

      {mode === "search" ? (
        <>
          <form ref={formRef} action={fillRundownItem}>
            <input type="hidden" name="rundown_id" value={config.rundownId} />
            <input type="hidden" name="break_id" value={config.breakId} />
            <input type="hidden" name="before_item_id" value={beforeItemId ?? ""} />
            <input type="hidden" name="content_item_id" value={pendingContentItemId} />
          </form>
          <Input
            autoFocus
            placeholder="Search content…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mb-2"
          />
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {showsWeather && (
              <li>
                <button
                  type="button"
                  onClick={() => pick(WEATHER_ITEM_SENTINEL)}
                  className="w-full rounded px-2 py-1.5 text-left text-sm text-ink-900 hover:bg-white"
                >
                  Today&apos;s weather
                </button>
              </li>
            )}
            {filtered.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => pick(candidate.id)}
                  className="w-full rounded px-2 py-1.5 text-left text-sm text-ink-900 hover:bg-white"
                >
                  {candidate.title}
                </button>
              </li>
            ))}
            {filtered.length === 0 && !showsWeather && (
              <li className="px-2 py-1.5 text-xs text-ink-400">No matching content.</li>
            )}
          </ul>
        </>
      ) : (
        <LiveReadForm
          rundownId={config.rundownId}
          breakId={config.breakId}
          beforeItemId={beforeItemId}
          nprItems={config.nprItems}
        />
      )}
    </li>
  );
}
