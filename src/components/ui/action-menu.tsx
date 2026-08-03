"use client";

import { useEffect, useRef, useState } from "react";

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  /** Styles the item as destructive/rare — doesn't add a confirm step itself, callers still own that. */
  variant?: "default" | "danger";
}

/**
 * A "⋮" trigger for a screen's less-frequent actions — introduced once a
 * source's workspace grew past two inline buttons (Reindex, Delete/Remove)
 * worth of them. Closes on an outside click, Escape, or an item firing;
 * callers own anything an item needs beyond that (a confirm step, a status
 * message) since this is just the disclosure, not the actions' behavior.
 */
export function ActionMenu({ label = "Actions", items }: { label?: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;

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
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-[11rem] rounded border border-line bg-white py-1 shadow-md"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-panel-50 ${
                item.variant === "danger" ? "text-danger" : "text-ink-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
