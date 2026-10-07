"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { FloatingPanel } from "@/components/ui/floating-panel";

export interface TabNavItem {
  href: string;
  label: string;
  active: boolean;
  /** Always sits behind the "⋯" menu, however much room there is (a tab few viewers need daily). */
  forceMore?: boolean;
  /** Always visible, set apart at the right edge — a utility tab (Setup) rather than a daily destination. */
  end?: boolean;
  /** A count of what is waiting in this tab, shown after the label only when above zero. */
  badge?: number;
}

function TabLabel({ tab }: { tab: TabNavItem }) {
  if (!tab.badge) return <>{tab.label}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {tab.label}
      <span className="rounded-full bg-[#0F2235] px-1.5 text-[11px] font-bold leading-4 text-white">
        {tab.badge}
        <span className="sr-only"> waiting</span>
      </span>
    </span>
  );
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
export function TabNav({ tabs: allTabs, className }: { tabs: TabNavItem[]; className?: string }) {
  const endTabs = allTabs.filter((tab) => tab.end && !tab.forceMore);
  const tabs = allTabs.filter((tab) => !tab.forceMore && !tab.end);
  const forced = allTabs.filter((tab) => tab.forceMore);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [menuOpen, setMenuOpen] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const itemEls = Array.from(measure.children) as HTMLElement[];

    function recompute() {
      if (!container) return;
      // The right-edge group (end tabs) is always shown, so its width is not available to the rest.
      const endWidth = endRef.current?.getBoundingClientRect().width ?? 0;
      const available = container.clientWidth - (endWidth > 0 ? endWidth + 20 : 0);
      const moreWidth = moreRef.current?.getBoundingClientRect().width ?? 40;
      const gap = 20; // matches gap-5
      const isLastItem = (i: number) => i === itemEls.length - 1 && forced.length === 0;

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
  }, [tabs, forced.length, endTabs.length]);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      // The menu is portaled to <body>, so it's outside containerRef — check both.
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const visible = tabs.slice(0, visibleCount);
  const overflow = [...tabs.slice(visibleCount), ...forced];
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
          <TabLabel tab={tab} />
        </Link>
      ))}

      <div className="ml-auto flex shrink-0 items-center gap-5">
        {overflow.length > 0 && (
          <div className="relative shrink-0">
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
            <FloatingPanel
              anchorRef={moreRef}
              open={menuOpen}
              ref={menuRef}
              role="menu"
              className="min-w-[10rem] rounded border border-line bg-white py-1 shadow-md"
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
                  <TabLabel tab={tab} />
                </Link>
              ))}
            </FloatingPanel>
          </div>
        )}
        <div ref={endRef} className="flex items-center gap-5">
          {endTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(TAB_CLASS, tab.active ? TAB_ACTIVE : TAB_INACTIVE)}
            >
              <TabLabel tab={tab} />
            </Link>
          ))}
        </div>
      </div>

      {/* Off-screen clone of every tab, used only to measure natural label widths. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible fixed flex gap-5"
        style={{ top: -9999, left: -9999 }}
      >
        {tabs.map((tab) => (
          <span key={tab.href} className={cn(TAB_CLASS, "border-transparent")}>
            <TabLabel tab={tab} />
          </span>
        ))}
      </div>
    </div>
  );
}
