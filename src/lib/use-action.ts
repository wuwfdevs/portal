"use client";

import { useCallback, useState, useTransition } from "react";

export const ACTION_FAILED_MESSAGE = "Something went wrong. Check your connection and try again.";

/** A user-facing message for a rejected action (a network failure, a thrown server error). */
export function actionFailureMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.message &&
    !/^(fetch failed|failed to fetch)/i.test(error.message)
  ) {
    // Server Action errors reach the browser with a generic production message;
    // anything readable is still worth showing.
    return error.message;
  }
  return ACTION_FAILED_MESSAGE;
}

/**
 * Run an async action (usually a Server Action) inside a transition, so
 * `pending` covers it, and turn a rejection into `error` — a rejection inside a
 * bare `startTransition` ends `pending` and tells nobody. `result` is whatever
 * the action last resolved with (including its own `{ ok: false, error }`);
 * `error` is only for a rejection. `run` never rejects.
 */
export function useAction<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<R | null>(null);

  const run = useCallback(
    (...args: Args) => {
      startTransition(async () => {
        setError(null);
        try {
          setResult(await fn(...args));
        } catch (caught) {
          setError(actionFailureMessage(caught));
        }
      });
    },
    [fn],
  );

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  return { run, pending, error, result, reset };
}
