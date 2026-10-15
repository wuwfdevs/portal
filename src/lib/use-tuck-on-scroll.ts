"use client";

import { useEffect, useState } from "react";
import { nextTucked } from "@/lib/tuck-on-scroll";

/**
 * True while a floating control (the assistant's bubble) should be tucked out of the way of what is
 * under it: scrolling down tucks it, scrolling up brings it back (`nextTucked`). It only listens
 * below `lg`, where the bubble can sit on a row's last button; on a wide screen it is always shown.
 */
export function useTuckOnScroll(): boolean {
  const [tucked, setTucked] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023.98px)");
    let lastY = window.scrollY;
    let frame = 0;

    function onScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setTucked((current) => (query.matches ? nextTucked(current, lastY, y) : false));
        lastY = y;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return tucked;
}
