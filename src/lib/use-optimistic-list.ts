"use client";

import { useEffect, useRef, useState } from "react";

type ActionOutcome = { ok: boolean; error?: string } | { error?: string };

/** What a failed action says, whichever result shape it uses; null when it succeeded. */
export function failureMessage(outcome: ActionOutcome): string | null {
  if ("ok" in outcome && outcome.ok === false) return outcome.error ?? FALLBACK_ERROR;
  return outcome.error ? outcome.error : null;
}

const FALLBACK_ERROR = "That change could not be saved.";
const UNREACHABLE_ERROR = "Could not reach the server. Check your connection and try again.";

/**
 * A list shown optimistically over server data: `apply` patches one item at
 * once, runs the action, and puts that one item back as it was if the action
 * fails (or throws, e.g. a network failure) and says why in `error`. Rollback is
 * per item and reads the live list, never a snapshot taken at render, so two
 * quick moves can't undo each other. When the same item is changed again before
 * the first action settles, only the latest change decides whether to roll back,
 * and it rolls back to the item's last *confirmed* value — what the server last
 * accepted — not to the previous optimistic one, so two failed moves of one
 * card can't leave it showing a state the server never had.
 * A new `serverItems` array (the server page re-rendered) replaces the list.
 */
export function useOptimisticList<T>(serverItems: T[], { getId }: { getId: (item: T) => string }) {
  const [items, setItems] = useState(serverItems);
  const [syncedFrom, setSyncedFrom] = useState(serverItems);
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef(items);
  const latestRef = useRef(new Map<string, number>());
  const confirmedRef = useRef(new Map<string, T>());
  const getIdRef = useRef(getId);

  if (syncedFrom !== serverItems) {
    setSyncedFrom(serverItems);
    setItems(serverItems);
  }

  useEffect(() => {
    liveRef.current = items;
    getIdRef.current = getId;
  });

  // New server data is the new truth for every item.
  useEffect(() => {
    confirmedRef.current.clear();
  }, [serverItems]);

  function apply(id: string, patch: Partial<T>, action: () => Promise<ActionOutcome>) {
    const previous = liveRef.current.find((item) => getIdRef.current(item) === id);
    if (!previous) return;
    const token = (latestRef.current.get(id) ?? 0) + 1;
    latestRef.current.set(id, token);
    if (!confirmedRef.current.has(id)) confirmedRef.current.set(id, previous);

    const next = liveRef.current.map((item) =>
      getIdRef.current(item) === id ? { ...item, ...patch } : item,
    );
    liveRef.current = next;
    setItems(next);
    setError(null);

    void (async () => {
      let message: string | null;
      try {
        message = failureMessage(await action());
      } catch {
        message = UNREACHABLE_ERROR;
      }
      if (message === null) {
        confirmedRef.current.set(id, { ...previous, ...patch });
        return;
      }
      if (latestRef.current.get(id) === token) {
        const baseline = confirmedRef.current.get(id) ?? previous;
        confirmedRef.current.delete(id);
        const restored = liveRef.current.map((item) =>
          getIdRef.current(item) === id ? baseline : item,
        );
        liveRef.current = restored;
        setItems(restored);
      }
      setError(message);
    })();
  }

  return { items, apply, error, clearError: () => setError(null) };
}
