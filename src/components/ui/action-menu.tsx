"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { useMediaQuery } from "@/lib/use-media-query";

export interface ActionMenuItem {
  label: string;
  /** Runs on click; omit for a link (`href`) or a form submit (`formId`). */
  onClick?: () => void | Promise<void | { error?: string | null }>;
  /** Renders the item as a link. */
  href?: string;
  /** Submits the form with this id on click, so a menu can fire a server action declared elsewhere on the page. */
  formId?: string;
  /** Styles the item as destructive/rare. Add `confirm` to put a step before it runs. */
  variant?: "default" | "danger";
  /** Shown but not actionable, with `hint` saying why. */
  disabled?: boolean;
  hint?: string;
  /** A rule above this item — the boundary between ordinary and destructive items. */
  dividerBefore?: boolean;
  /**
   * Puts a step between the tap and the action: the menu swaps to this message
   * and a confirm button, and only that button runs `onClick`. The consequence
   * is read in the same place it is chosen, so there is no panel to overflow a
   * small screen. `onClick` may be async; a returned `{ error }` is shown and
   * the step stays open.
   */
  confirm?: { message: ReactNode; confirmLabel: string };
}

/**
 * Below lg the menu opens as a bottom sheet instead of a floating popover: big
 * rows a thumb can hit, a Cancel button, and nothing that can run off the edge
 * of a small screen. Every menu in the portal gets this, which is the point —
 * a row of actions should look and behave the same wherever it is.
 *
 * A "⋮" trigger for a screen's less-frequent actions. Closes on an outside
 * click, Escape, or an item firing. An item with `confirm` swaps the menu to its
 * consequence and a confirm button first; anything else a caller needs beyond
 * that (a status message) is theirs, since this is the disclosure, not the
 * actions' behavior.
 */
export function ActionMenu({
  label = "Actions",
  items,
  trigger = "boxed",
  triggerLabel,
  sheetHeading,
}: {
  label?: string;
  items: ActionMenuItem[];
  /** `quiet` drops the border, for a menu repeated on every row of a long list. */
  trigger?: "boxed" | "quiet";
  /** Replaces the ⋮ with a labelled button ("Used in 4 projects ▾") for a menu that is a list to pick from, not a set of actions. */
  triggerLabel?: ReactNode;
  /** Shown at the top of the bottom sheet below lg, so it says which row the actions are for. */
  sheetHeading?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<ActionMenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const narrow = useMediaQuery("(max-width: 1023px)");
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setConfirming(null);
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    // A sheet closes from its backdrop's click, not on pointerdown: closing on
    // pointerdown unmounts it before the click, and the tap then lands on
    // whatever was underneath.
    function handlePointerDown(event: PointerEvent) {
      if (narrow || busy) return;
      const target = event.target as Node;
      // The panel is portaled to <body>, so it's outside containerRef — check both.
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        close();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) close();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    // The page behind a sheet should not scroll under the finger.
    const previousOverflow = document.body.style.overflow;
    if (narrow) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, narrow, busy]);

  if (items.length === 0) return null;

  const itemClasses = (item: ActionMenuItem) =>
    `${
      narrow
        ? "flex min-h-[3.25rem] w-full flex-col justify-center px-4 py-2 text-left text-base"
        : "block w-full px-3 py-1.5 text-left text-sm"
    } ${
      item.disabled
        ? "cursor-default text-ink-400"
        : item.variant === "danger"
          ? "text-danger hover:bg-panel-50"
          : "text-ink-700 hover:bg-panel-50"
    }`;

  async function runConfirmed(item: ActionMenuItem) {
    setBusy(true);
    setError(null);
    try {
      const result = await item.onClick?.();
      if (result && typeof result === "object" && result.error) {
        setError(result.error);
        return;
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const itemList = items.map((item) => {
    const body = (
      <>
        <span className="block">{item.label}</span>
        {item.hint && (
          <span
            className={
              narrow
                ? "block text-sm text-ink-500"
                : "block text-xs text-ink-400 sm:whitespace-nowrap"
            }
          >
            {item.hint}
          </span>
        )}
      </>
    );
    // Between groups: a single rule in the popover. On a phone there is no
    // separator at all — every row is divided from the next by the same hairline
    // and a group is told apart by its row (a destructive one is red), because
    // a band between two rows reads as a gap in an otherwise even list.
    const divider =
      item.dividerBefore && !narrow ? (
        <div role="separator" className="my-1 border-t border-line" />
      ) : null;
    if (item.disabled) {
      return (
        <Fragment key={item.href ?? item.label}>
          {divider}
          <div role="menuitem" aria-disabled="true" className={itemClasses(item)}>
            {body}
          </div>
        </Fragment>
      );
    }
    if (item.href) {
      return (
        <Fragment key={item.href ?? item.label}>
          {divider}
          <Link role="menuitem" href={item.href} onClick={close} className={itemClasses(item)}>
            {body}
          </Link>
        </Fragment>
      );
    }
    return (
      <Fragment key={item.href ?? item.label}>
        {divider}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            if (item.confirm) {
              setConfirming(item);
              return;
            }
            // Submit before closing: closing unmounts this button, and a
            // detached submitter has no form owner, so a plain type="submit"
            // with the `form` attribute would submit nothing once the menu
            // re-rendered.
            if (item.formId) {
              const form = document.getElementById(item.formId);
              if (form instanceof HTMLFormElement) form.requestSubmit();
            }
            close();
            void item.onClick?.();
          }}
          className={itemClasses(item)}
        >
          {body}
        </button>
      </Fragment>
    );
  });

  const confirmStep = confirming?.confirm ? (
    <div className={narrow ? "flex flex-col gap-3 px-4 pb-1 pt-2" : "flex w-72 flex-col gap-3 p-3"}>
      <div className="text-sm font-bold text-ink-900">{confirming.label}</div>
      <div className="text-sm leading-relaxed text-ink-700">{confirming.confirm.message}</div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => void runConfirmed(confirming)}
          className="max-lg:min-h-12"
        >
          {busy ? "Working…" : confirming.confirm.confirmLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setConfirming(null);
            setError(null);
          }}
          className="max-lg:min-h-12"
        >
          Back
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel ? undefined : label}
        onClick={() => (open ? close() : setOpen(true))}
        className={
          triggerLabel
            ? "inline-flex h-11 items-center gap-1.5 rounded border border-line bg-white px-3 text-sm font-semibold text-brand-link hover:border-brand-primary lg:h-9"
            : trigger === "quiet"
              ? "flex h-11 w-11 items-center justify-center rounded text-ink-400 hover:bg-panel-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface lg:h-8 lg:w-8"
              : "flex h-11 w-11 items-center justify-center rounded border border-line text-ink-500 hover:border-brand-primary hover:text-brand-link lg:h-8 lg:w-8"
        }
      >
        {triggerLabel ? (
          <>
            {triggerLabel}
            <span aria-hidden="true" className="text-[10px]">
              ▾
            </span>
          </>
        ) : (
          <span aria-hidden="true" className="text-lg leading-none">
            ⋮
          </span>
        )}
      </button>
      {narrow ? (
        open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <div
              aria-hidden="true"
              onClick={() => !busy && close()}
              className="absolute inset-0 bg-[#0F2235]/50"
            />
            <div
              ref={panelRef}
              role="menu"
              aria-label={label}
              className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-xl bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,34,53,0.2)]"
            >
              <div aria-hidden="true" className="mx-auto mb-2 h-1 w-9 rounded-full bg-line" />
              {confirmStep ?? (
                <>
                  {sheetHeading && (
                    <div className="px-4 pb-3 pt-1 text-sm text-ink-700">{sheetHeading}</div>
                  )}
                  <div className="divide-y divide-line border-y border-line">{itemList}</div>
                  <div className="px-4 pt-3">
                    <button
                      type="button"
                      onClick={close}
                      className="h-12 w-full rounded border border-line bg-white text-base font-semibold text-ink-700"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      ) : (
        <FloatingPanel
          anchorRef={containerRef}
          open={open}
          ref={panelRef}
          role="menu"
          className="min-w-[11rem] rounded border border-line bg-white py-1 shadow-md"
        >
          {confirmStep ?? itemList}
        </FloatingPanel>
      )}
    </div>
  );
}
