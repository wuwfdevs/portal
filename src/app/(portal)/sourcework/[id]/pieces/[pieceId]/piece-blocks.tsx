"use client";

import { useEffect, useLayoutEffect, useRef, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
import { PlayIcon } from "../../transport-icons";
import type { ActualityBlock, NarrationBlock } from "@/lib/sourcework/pieces";
import type { PieceExcerpt } from "@/lib/sourcework/piece-queries";

const BLOCK_LABEL =
  "text-[11px] font-bold uppercase tracking-[0.05em] max-lg:mb-0.5 lg:w-[72px] lg:flex-none lg:pt-3";

/**
 * The shell shared by both block kinds: a drag handle and a label column on a
 * desktop (reordering is Move up / Move down in the ⋮ menu everywhere, and
 * keyboard and touch have nothing else), and the menu beside the card.
 */
export function BlockRow({
  id,
  label,
  seconds,
  accent,
  onDragStart,
  onDropOn,
  menu,
  children,
}: {
  id: string;
  label: string;
  seconds: number;
  accent: "narration" | "actuality";
  onDragStart: (id: string) => void;
  onDropOn: (id: string) => void;
  menu: ReactNode;
  children: ReactNode;
}) {
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }
  return (
    <div
      onDragOver={handleDragOver}
      onDrop={(event) => {
        event.preventDefault();
        onDropOn(id);
      }}
      className="flex items-start gap-2"
    >
      <span
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", id);
          onDragStart(id);
        }}
        title="Drag to reorder"
        aria-hidden="true"
        className="hidden w-5 flex-none cursor-grab select-none pt-3 text-base tracking-[-2px] text-ink-400 lg:block"
      >
        ⋮⋮
      </span>
      <div
        className={cn(
          BLOCK_LABEL,
          "hidden lg:block",
          accent === "actuality" ? "text-brand-link" : "text-ink-500",
        )}
      >
        {label}
        <br />
        <span className="font-mono font-normal tracking-normal">{formatClock(seconds)}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex-none max-lg:-mr-2 max-lg:-mt-1 lg:mt-0">{menu}</div>
    </div>
  );
}

export function NarrationRow({
  block,
  seconds,
  focus,
  onFocused,
  onChange,
  onEnterAtEnd,
  onBackspaceEmpty,
  assistantNote,
  menuItems,
  ...dragProps
}: {
  block: NarrationBlock;
  seconds: number;
  focus: boolean;
  onFocused: () => void;
  onChange: (text: string) => void;
  onEnterAtEnd: () => void;
  onBackspaceEmpty: () => void;
  assistantNote?: ReactNode;
  menuItems: ActionMenuItem[];
  onDragStart: (id: string) => void;
  onDropOn: (id: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text: a block is as tall as its words, never a scrolling box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [block.text]);

  useEffect(() => {
    if (!focus) return;
    ref.current?.focus();
    onFocused();
  }, [focus, onFocused]);

  return (
    <BlockRow
      id={block.id}
      label={block.role === "anchor" ? "Anchor intro" : "Narration"}
      seconds={seconds}
      accent="narration"
      menu={
        <ActionMenu
          label="Narration block actions"
          trigger="quiet"
          sheetHeading="Narration"
          items={menuItems}
        />
      }
      {...dragProps}
    >
      <div className="rounded border border-line bg-white px-3.5 py-2.5 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-surface">
        <p className={cn(BLOCK_LABEL, "lg:hidden", "!w-auto text-ink-500")}>
          {block.role === "anchor" ? "Anchor intro · not timed" : "Narration"} ·{" "}
          {formatClock(seconds)}
        </p>
        <textarea
          ref={ref}
          value={block.text}
          rows={1}
          aria-label={block.role === "anchor" ? "Anchor intro" : "Narration"}
          placeholder={block.role === "anchor" ? "Write the anchor intro…" : "Write narration…"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            const el = event.currentTarget;
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              el.selectionStart === el.value.length &&
              el.selectionEnd === el.value.length &&
              el.value.trim() !== ""
            ) {
              event.preventDefault();
              onEnterAtEnd();
            } else if (event.key === "Backspace" && el.value === "") {
              event.preventDefault();
              onBackspaceEmpty();
            }
          }}
          className="block w-full resize-none overflow-hidden bg-transparent font-serif text-[17px] leading-normal text-ink-900 placeholder:text-ink-400 focus:outline-none"
        />
        {assistantNote}
      </div>
    </BlockRow>
  );
}

export function ActualityRow({
  block,
  excerpt,
  text,
  seconds,
  trimmed,
  playing,
  onPlay,
  menuItems,
  below,
  assistantNote,
  ...dragProps
}: {
  block: ActualityBlock;
  /** Undefined when the excerpt has been deleted since. */
  excerpt: PieceExcerpt | undefined;
  text: string;
  seconds: number;
  trimmed: boolean;
  playing: boolean;
  onPlay: () => void;
  menuItems: ActionMenuItem[];
  below?: ReactNode;
  assistantNote?: ReactNode;
  onDragStart: (id: string) => void;
  onDropOn: (id: string) => void;
}) {
  return (
    <>
      <BlockRow
        id={block.id}
        label="Actuality"
        seconds={seconds}
        accent="actuality"
        menu={
          <ActionMenu
            label="Excerpt block actions"
            trigger="quiet"
            sheetHeading={excerpt ? `Excerpt · ${excerpt.speaker ?? excerpt.title}` : "Excerpt"}
            items={menuItems}
          />
        }
        {...dragProps}
      >
        <div className="flex items-center gap-3 rounded border border-l-4 border-line border-l-clipped-line bg-white px-3.5 py-2.5 max-lg:gap-2.5">
          {excerpt ? (
            <>
              <button
                type="button"
                onClick={onPlay}
                aria-label={playing ? "Stop" : "Play this clip"}
                title={playing ? "Stop" : "Play this clip"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-link text-brand-link transition-colors hover:bg-brand-surface max-lg:h-11 max-lg:w-11"
              >
                {playing ? (
                  <span aria-hidden="true" className="h-2.5 w-2.5 bg-current" />
                ) : (
                  <PlayIcon className="ml-0.5 h-2.5 w-2.5" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-base leading-snug text-ink-900">
                  {text ? `“${text}”` : <span className="text-ink-400">(no words found)</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {[excerpt.speaker, formatClock(seconds), trimmed ? "trimmed in this piece" : null]
                    .filter(Boolean)
                    .join(" · ")}
                  <span className="max-lg:hidden"> · wording comes from the transcript</span>
                </p>
                {assistantNote}
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm text-ink-500">
                This excerpt was deleted, so there is nothing to play here. Swap it for another or
                remove the block.
              </p>
              {assistantNote}
            </div>
          )}
        </div>
      </BlockRow>
      {below}
    </>
  );
}

/** A secondary button that behaves as a link-style toolbar action. */
export function FooterButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="secondary" size="sm" {...props} className="max-lg:min-h-11" />;
}
