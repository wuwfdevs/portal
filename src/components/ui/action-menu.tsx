"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FloatingPanel } from "@/components/ui/floating-panel";

export interface ActionMenuItem {
  label: string;
  /** Runs on click; omit for a link (`href`) or a form submit (`formId`). */
  onClick?: () => void;
  /** Renders the item as a link. */
  href?: string;
  /** Submits the form with this id on click, so a menu can fire a server action declared elsewhere on the page. */
  formId?: string;
  /** Styles the item as destructive/rare — doesn't add a confirm step itself, callers still own that. */
  variant?: "default" | "danger";
  /** Shown but not actionable, with `hint` saying why. */
  disabled?: boolean;
  hint?: string;
  /** A rule above this item — the boundary between ordinary and destructive items. */
  dividerBefore?: boolean;
}

/**
 * A "⋮" trigger for a screen's less-frequent actions — introduced once a
 * source's workspace grew past two inline buttons (Reindex, Delete/Remove)
 * worth of them. Closes on an outside click, Escape, or an item firing;
 * callers own anything an item needs beyond that (a confirm step, a status
 * message) since this is just the disclosure, not the actions' behavior.
 */
export function ActionMenu({
  label = "Actions",
  items,
}: {
  label?: string;
  items: ActionMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      // The panel is portaled to <body>, so it's outside containerRef — check both.
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  const itemClasses = (item: ActionMenuItem) =>
    `block w-full px-3 py-1.5 text-left text-sm ${
      item.disabled
        ? "cursor-default text-ink-400"
        : item.variant === "danger"
          ? "text-danger hover:bg-panel-50"
          : "text-ink-700 hover:bg-panel-50"
    }`;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded border border-line text-ink-500 hover:border-brand-primary hover:text-brand-link"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⋮
        </span>
      </button>
      <FloatingPanel
        anchorRef={containerRef}
        open={open}
        ref={panelRef}
        role="menu"
        className="min-w-[11rem] rounded border border-line bg-white py-1 shadow-md"
      >
        {items.map((item) => {
          const body = (
            <>
              <span className="block">{item.label}</span>
              {item.hint && (
                <span className="block text-xs text-ink-400 sm:whitespace-nowrap">{item.hint}</span>
              )}
            </>
          );
          const divider = item.dividerBefore ? (
            <div role="separator" className="my-1 border-t border-line" />
          ) : null;
          if (item.disabled) {
            return (
              <div key={item.label}>
                {divider}
                <div role="menuitem" aria-disabled="true" className={itemClasses(item)}>
                  {body}
                </div>
              </div>
            );
          }
          if (item.href) {
            return (
              <div key={item.label}>
                {divider}
                <Link
                  role="menuitem"
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={itemClasses(item)}
                >
                  {body}
                </Link>
              </div>
            );
          }
          return (
            <div key={item.label}>
              {divider}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  // Submit before closing: closing unmounts this button, and
                  // a detached submitter has no form owner, so a plain
                  // type="submit" with the `form` attribute would submit
                  // nothing once the menu re-rendered.
                  if (item.formId) {
                    const form = document.getElementById(item.formId);
                    if (form instanceof HTMLFormElement) form.requestSubmit();
                  }
                  setOpen(false);
                  item.onClick?.();
                }}
                className={itemClasses(item)}
              >
                {body}
              </button>
            </div>
          );
        })}
      </FloatingPanel>
    </div>
  );
}
