/**
 * One run at a time per key, where a request that arrives mid-run is not dropped: it asks the
 * active run to go round again once it finishes. For work whose input can change while it runs
 * (an excerpt trimmed again before the last trim's measuring is done), so the newest input is
 * always the one processed last, and a burst of requests costs at most one extra pass.
 *
 * `pass` returns true when its own result came out stale (the input moved on underneath it) and it
 * should run again. `maxPasses` bounds a key that keeps changing; the last pass simply stands.
 * A caller that arrives while a run is active returns at once; the active run does the work.
 */
export function createCoalescedRunner() {
  const active = new Map<string, { again: boolean }>();

  return async function run(
    key: string,
    pass: () => Promise<boolean | void>,
    maxPasses = 5,
  ): Promise<void> {
    const running = active.get(key);
    if (running) {
      running.again = true;
      return;
    }

    const state = { again: false };
    active.set(key, state);
    try {
      for (let passes = 0; passes < maxPasses; passes += 1) {
        state.again = false;
        const stale = await pass();
        if (!state.again && stale !== true) break;
      }
    } finally {
      active.delete(key);
    }
  };
}
