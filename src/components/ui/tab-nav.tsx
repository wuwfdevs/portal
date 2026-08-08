"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface TabNavItem {
  href: string;
  label: string;
  active: boolean;
}

const TAB_CLASS =
  "-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2 text-[13px] font-semibold transition-colors";
const TAB_ACTIVE = "border-brand-primary text-brand-link";
const TAB_INACTIVE = "border-transparent text-ink-400 hover:border-line hover:text-ink-700";

/**
 * A tool's top-level tab bar. Renders every tab that fits the available
 * width and collapses the rest behind a "⋯" toggle, measured live via
 * ResizeObserver rather than a fixed breakpoint — the tools that use this
 * have different tab counts/label lengths, so a Tailwind-breakpoint cutoff
 * would need per-tool tuning and would still break on unusual zoom/font
 * settings. Caller precomputes each tab's `active` state (route matching
 * varies per tool — see editorial's alsoMatch) rather than this component
 * guessing from the pathname itself.
 */
export function TabNav({ tabs, className }: { tabs: TabNavItem[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [menuOpen, setMenuOpen] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const itemEls = Array.from(measure.children) as HTMLElement[];

    function recompute() {
      if (!container) return;
      const available = container.clientWidth;
      const moreWidth = moreRef.current?.getBoundingClientRect().width ?? 40;
      const gap = 20; // matches gap-5
      const isLastItem = (i: number) => i === itemEls.length - 1;

      let used = 0;
      let count = 0;
      for (let i = 0; i < itemEls.length; i++) {
        const el = itemEls[i];
        if (!el) break;
        const width = el.getBoundingClientRect().width + (i > 0 ? gap : 0);
        // The last tab never needs room reserved for the "more" toggle after it.
        const limit = isLastItem(i) ? available : available - gap - moreWidth;
        if (used + width > limit) break;
        used += width;
        count++;
      }
      setVisibleCount(Math.max(count, 1));
    }

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [tabs]);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const visible = tabs.slice(0, visibleCount);
  const overflow = tabs.slice(visibleCount);
  const overflowHasActive = overflow.some((tab) => tab.active);

  return (
    <div
      ref={containerRef}
      className={cn("relative mb-6 flex items-center gap-5 border-b border-line", className)}
    >
      {visible.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(TAB_CLASS, tab.active ? TAB_ACTIVE : TAB_INACTIVE)}
        >
          {tab.label}
        </Link>
      ))}

      {overflow.length > 0 && (
        <div className="relative ml-auto shrink-0">
          <button
            ref={moreRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More tabs"
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              TAB_CLASS,
              "flex items-center px-1",
              overflowHasActive ? TAB_ACTIVE : TAB_INACTIVE,
            )}
          >
            <span aria-hidden="true" className="text-base leading-none">
              ⋯
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded border border-line bg-white py-1 shadow-md"
            >
              {overflow.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  role="menuitem"
                  aria-current={tab.active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "block px-3 py-1.5 text-sm hover:bg-panel-50",
                    tab.active ? "font-semibold text-brand-link" : "text-ink-700",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Off-screen clone of every tab, used only to measure natural label widths. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible fixed flex gap-5"
        style={{ top: -9999, left: -9999 }}
      >
        {tabs.map((tab) => (
          <span key={tab.href} className={cn(TAB_CLASS, "border-transparent")}>
            {tab.label}
          </span>
        ))}
      </div>
    </div>
  );
}
