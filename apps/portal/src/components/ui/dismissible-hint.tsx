"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { dismissHint, isHintDismissed, subscribeToHints } from "@/lib/dismissed-hints";
import { TAP_TARGET } from "./tap-target";

/**
 * A short piece of how-to text that shows until the person has read it, then goes away for good
 * ("Got it"). Use it for instructions a screen needs the first time and never again: how to select
 * text into an excerpt, what a filter does, where a setting lives. Text that stays useful for as
 * long as the screen is open (a field's format, an error, a status) belongs in the page, in `Alert`
 * or beside the control, not here. See docs/ui-patterns.md, "One-time hints".
 *
 * `id` names the hint and is the remembered key: unique, stable and kebab-case ("transcript-select").
 * Changing an id shows the hint again, which is how to re-announce a screen that changed.
 *
 * It renders nothing on the server and on the first client render, then appears once the browser's
 * dismissal is known: a returning reader never sees the hint flash, and a new reader sees it arrive
 * after hydration. Keep it out of the first screen's critical layout (above content that must not
 * move) or give its slot a fixed height.
 */
export function DismissibleHint({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const dismissed = useSyncExternalStore(
    subscribeToHints,
    () => isHintDismissed(id),
    () => true,
  );
  if (dismissed) return null;

  return (
    <div
      role="note"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 rounded bg-brand-surface px-3 py-2 text-sm text-brand-link",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={() => dismissHint(id)}
        className={cn(
          "shrink-0 rounded px-1 font-bold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
          TAP_TARGET,
        )}
      >
        Got it
      </button>
    </div>
  );
}
