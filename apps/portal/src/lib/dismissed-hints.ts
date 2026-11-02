import { safeGet, safeSet } from "@/lib/safe-storage";

/**
 * Which one-time hints this browser has dismissed (`components/ui/dismissible-hint.tsx`).
 * Remembered per browser in localStorage, never per account: a hint is about getting used to a
 * screen, and nothing here is worth a table. When storage is blocked a dismissal still holds for
 * the rest of the page's life (the in-memory set), so the "Got it" button never appears to do nothing.
 */
const KEY_PREFIX = "hint-dismissed:";

const dismissedThisSession = new Set<string>();
const listeners = new Set<() => void>();

export function hintStorageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export function isHintDismissed(id: string): boolean {
  return dismissedThisSession.has(id) || safeGet("local", hintStorageKey(id)) === "1";
}

export function dismissHint(id: string): void {
  dismissedThisSession.add(id);
  safeSet("local", hintStorageKey(id), "1");
  for (const listener of listeners) listener();
}

export function subscribeToHints(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: forget in-memory dismissals. */
export function resetDismissedHintsForTests(): void {
  dismissedThisSession.clear();
}
