"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useDismissable } from "@/lib/use-dismissable";

/**
 * Glue for the `<details>`/`<summary>` menus: tracks the native open state
 * so a FloatingPanel can follow it, and closes on an outside tap or Escape
 * (treating the portaled panel as inside). Put `detailsRef` and `onToggle`
 * on the `<details>`, pass `detailsRef` as the panel's anchor and `panelRef`
 * as its ref, and call `close()` where an item used to do
 * `closest("details").removeAttribute("open")` — that lookup can't reach
 * the `<details>` from inside a portal.
 */
export function useDetailsMenu(
  detailsRef: RefObject<HTMLDetailsElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  onClose?: () => void,
) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    detailsRef.current?.removeAttribute("open");
  }, [detailsRef]);

  useDismissable({ open, refs: [detailsRef, panelRef], onDismiss: close });

  function onToggle(event: React.SyntheticEvent<HTMLDetailsElement>) {
    // Toggle events from a nested <details> inside the panel bubble here through the portal.
    if (event.target !== event.currentTarget) return;
    const isOpen = event.currentTarget.open;
    setOpen(isOpen);
    if (!isOpen) onClose?.();
  }

  return { open, close, onToggle };
}

/** Gap kept between a panel and the viewport edge, in px. */
const EDGE = 8;

/**
 * The positioned half of every dropdown/context menu in the portal.
 *
 * Menus used to be `absolute` children of their trigger with a small
 * z-index. That broke in two ways on phones: an `right-0` panel wider than
 * the space left of its trigger ran off the left edge of the screen, and a
 * later sticky/positioned sibling with the same z-index (the Sourcework
 * player bar, a dnd-kit card's transform) painted over the open menu. This
 * renders the panel into `document.body` instead — out of every ancestor's
 * stacking context and overflow clip — as a `fixed` box measured against
 * its anchor and clamped to the viewport: aligned to the anchor's right
 * (`end`) or left (`start`) edge, flipped above the anchor when there's no
 * room below, and given a max height with its own scroll when there's room
 * in neither direction.
 *
 * Because the panel is no longer inside the trigger's DOM subtree, any
 * outside-click handler must treat `ref` (the panel) as "inside" too, and
 * `element.closest(...)` from inside the panel won't find the trigger's
 * ancestors — close through state instead.
 */
export function FloatingPanel({
  anchorRef,
  open,
  align = "end",
  offset = 4,
  className,
  children,
  ref,
  role,
  id,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  align?: "start" | "end";
  offset?: number;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
  role?: string;
  id?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Mount on first open, then stay mounted (hidden) while closed — the same
  // lifetime a <details> body has, so a form inside the panel that submits
  // and closes it in one event isn't unmounted mid-submit.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;

    // Position is written straight to the element rather than through React
    // state: measuring needs the constraints cleared first, and React would
    // not reapply a style value it thinks is unchanged.
    function place() {
      const anchor = anchorRef.current;
      if (!anchor || !panel) return;

      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const a = anchor.getBoundingClientRect();

      // Measure the natural size with nothing constraining it but the viewport.
      panel.style.width = "";
      panel.style.maxHeight = "";
      panel.style.overflowY = "";
      panel.style.maxWidth = `${vw - EDGE * 2}px`;
      const width = Math.min(panel.offsetWidth, vw - EDGE * 2);
      const height = panel.offsetHeight;

      let left = align === "end" ? a.right - width : a.left;
      left = Math.max(EDGE, Math.min(left, vw - width - EDGE));

      const below = vh - a.bottom - offset - EDGE;
      const above = a.top - offset - EDGE;
      let top: number;
      let maxHeight: number | null = null;
      if (height <= below || below >= above) {
        top = a.bottom + offset;
        if (height > below) maxHeight = Math.max(below, 120);
      } else {
        top = a.top - offset - Math.min(height, above);
        if (height > above) maxHeight = above;
      }

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
      // Lock the measured width so moving away from left:0 can't reflow it narrower.
      panel.style.width = `${width}px`;
      if (maxHeight !== null) {
        panel.style.maxHeight = `${maxHeight}px`;
        panel.style.overflowY = "auto";
      }
      panel.style.visibility = "visible";
    }

    function onScroll(event: Event) {
      // Scrolling inside the panel itself doesn't move its anchor.
      if (event.target instanceof Node && panel?.contains(event.target)) return;
      place();
    }

    place();
    // Capture phase so scrolling any ancestor container (not just the window) re-places it.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      panel.style.visibility = "hidden";
    };
  }, [open, align, offset, anchorRef, mounted]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={(node) => {
        panelRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as RefObject<HTMLDivElement | null>).current = node;
      }}
      role={role}
      id={id}
      // Inline display, not the `hidden` attribute: a caller's `flex` class
      // would beat [hidden]. Visibility starts hidden until placed, so the
      // panel never flashes at the origin.
      style={{ top: 0, left: 0, visibility: "hidden", display: open ? undefined : "none" }}
      className={cn("fixed z-50", className)}
    >
      {children}
    </div>,
    document.body,
  );
}
