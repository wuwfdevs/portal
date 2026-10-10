"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/lib/use-media-query";
import type { PieceExcerpt } from "@/lib/sourcework/piece-queries";
import { ExcerptPicker } from "./excerpt-picker";

/**
 * "Add something here" between every block, before the first and after the
 * last — the rundown's insertion point (log/rundowns/[id]/insertion-point.tsx)
 * with this editor's two modes. Visible at rest (a hairline, a circled +, a
 * hairline), never hover-only. On a phone the panel is a bottom sheet and the
 * row is 44px tall.
 */
export function PieceInsertionPoint({
  id,
  excerpts,
  onAddNarration,
  onAddExcerpt,
  onAskAssistant,
  afterLabel,
}: {
  id: string;
  excerpts: PieceExcerpt[];
  onAddNarration: () => void;
  onAddExcerpt: (excerpt: PieceExcerpt) => void;
  /** "Ask the assistant to write it": opens the assistant with a request to finish (§6.4). */
  onAskAssistant?: () => void;
  /** What the sheet says it is adding after, on a phone. */
  afterLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"narration" | "excerpt">("narration");
  const narrow = useMediaQuery("(max-width: 1023px)");

  function close() {
    setOpen(false);
    setMode("narration");
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Add a block here"
      className="group flex w-full items-center gap-2 rounded text-ink-400 hover:text-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface max-lg:h-11 lg:h-5"
    >
      <span className="h-px flex-1 bg-line transition-colors group-hover:bg-brand-primary" />
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-current text-xs leading-none max-lg:h-6 max-lg:w-6 max-lg:text-base">
        +
      </span>
      <span className="h-px flex-1 bg-line transition-colors group-hover:bg-brand-primary" />
    </button>
  );

  if (!open) return <div className="lg:mx-[100px] lg:mr-10">{trigger}</div>;

  if (narrow) {
    const sheet = (
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <button
          type="button"
          aria-label="Cancel"
          onClick={close}
          className="absolute inset-0 bg-[rgba(15,34,53,0.5)]"
        />
        <div
          role="dialog"
          aria-label="Add a block"
          className="relative max-h-[85vh] overflow-y-auto rounded-t-xl bg-white px-4 pb-4 pt-2"
        >
          <div className="mx-auto mb-2.5 h-1 w-9 rounded-sm bg-line" />
          {afterLabel && <p className="pb-2 text-[13px] text-ink-500">Add after {afterLabel}</p>}
          {mode === "narration" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onAddNarration();
                  close();
                }}
                className="flex h-[52px] w-full items-center border-t border-line text-left text-base"
              >
                Narration
              </button>
              <button
                type="button"
                onClick={() => setMode("excerpt")}
                className="flex h-[52px] w-full items-center border-t border-line text-left text-base"
              >
                Excerpt from this project…
              </button>
              {onAskAssistant && (
                <button
                  type="button"
                  onClick={() => {
                    onAskAssistant();
                    close();
                  }}
                  className="flex h-[52px] w-full items-center border-t border-line text-left text-base text-brand-link"
                >
                  Ask the assistant to write it
                </button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={close}
                className="mt-2.5 min-h-12 w-full text-ink-700"
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <ExcerptPicker
                listId={`piece-picker-${id}`}
                excerpts={excerpts}
                onPick={(excerpt) => {
                  onAddExcerpt(excerpt);
                  close();
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={close}
                className="mt-2.5 min-h-12 w-full text-ink-700"
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    );
    return (
      <>
        {trigger}
        {createPortal(sheet, document.body)}
      </>
    );
  }

  return (
    <div className="my-1 rounded border border-dashed border-brand-primary bg-brand-surface/20 p-3 lg:mx-[100px] lg:mr-10">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["narration", "excerpt"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded px-2 py-1 text-xs font-bold ${mode === value ? "bg-white text-brand-link" : "text-ink-500"}`}
            >
              {value === "narration" ? "Narration" : "Excerpt"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cancel"
          className="rounded px-1.5 text-xs font-bold text-ink-500 hover:bg-white"
        >
          ×
        </button>
      </div>
      {mode === "narration" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            autoFocus
            onClick={() => {
              onAddNarration();
              close();
            }}
          >
            + Add a narration block
          </Button>
          {onAskAssistant && (
            <Button
              type="button"
              variant="link"
              onClick={() => {
                onAskAssistant();
                close();
              }}
            >
              Ask the assistant to write it
            </Button>
          )}
        </div>
      ) : (
        <ExcerptPicker
          listId={`piece-picker-${id}`}
          excerpts={excerpts}
          onPick={(excerpt) => {
            onAddExcerpt(excerpt);
            close();
          }}
        />
      )}
    </div>
  );
}
