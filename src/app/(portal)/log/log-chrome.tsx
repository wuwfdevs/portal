"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "./nav-tabs";

// The rundown builder/console screen (/log/rundowns/[id]) is a focused,
// full-context live-broadcast view in its own right — see CLAUDE.md's "Log:
// builder and console merged into one screen." Its own sticky header already
// carries the program name and live timing state, and its own "← Back to
// Today" link is the way out. Repeating the tool-level "Log" title and the
// cross-screen Today/Clocks/Programs/... nav tabs above that sticky bar just
// added chrome a host mid-broadcast has no use for, on the one Log screen
// meant to minimize distraction. Every other Log screen keeps the ordinary
// title + nav tabs — this is a deliberate exception for that one screen, not
// a new pattern for the tool as a whole.
export function LogChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/log/rundowns/")) return <>{children}</>;

  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Log</h1>
        <p className="mt-1 text-xs text-ink-400">
          Daily broadcast rundown planning — clocks, programs, the content library, NPR and weather in
          context, and the live-broadcast host view.
        </p>
      </div>
      <NavTabs />
      {children}
    </>
  );
}
