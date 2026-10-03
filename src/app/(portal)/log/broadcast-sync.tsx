"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  describeQueuedAction,
  isDeployMismatchError,
  retryDelayMs,
  sortEntries,
  type QueuedBroadcastAction,
  type QueueEntry,
} from "@/lib/log/broadcast-queue";
import { openBroadcastQueueStore, type BroadcastQueueStore } from "@/lib/log/broadcast-queue-store";
import { formatStationClockTime } from "@/lib/log/timezone";
import { pingLog, syncBroadcastAction } from "./broadcast-actions";

// The live rundown screen's offline queue — the React half. The rules live
// in lib/log/broadcast-queue.ts (pure, tested) and persistence in
// lib/log/broadcast-queue-store.ts; this provider owns the drain loop, the
// connectivity state every control on the screen reads, and the status bar
// that tells the host what's happening. docs/log-design.md §6, "Host
// live-view resilience."
//
// Three things it has to get right, each from how the screen actually
// fails when the connection drops:
//
// - A <form action={serverAction}> that can't reach the server throws into
//   the route's error boundary, replacing the whole rundown with "Log
//   couldn't load". So the queued actions never use a form, and every
//   control that still does (fill, edit, submit…) is disabled while
//   `connected` is false — RequiresConnection below, or the hook directly.
// - router.refresh() that fails falls back to a full browser navigation,
//   which offline is the browser's own "no internet" page. So the poller
//   asks this provider (and a probe) before refreshing; see log-poller.tsx.
// - An acknowledged action leaves the queue before the page re-renders with
//   it. Dropping it from the screen in that gap would briefly undo the
//   host's tap, so acknowledged actions stay in `overlay` as "settled" until
//   the next server render (a new `renderedAt`) replaces them.

type NewQueuedAction = QueuedBroadcastAction extends infer A
  ? A extends QueuedBroadcastAction
    ? Omit<A, "id" | "rundownId" | "occurredAt">
    : never
  : never;

interface Rejection {
  id: string;
  text: string;
  message: string;
}

export interface BroadcastSyncValue {
  /** The browser says it's online and the last contact with the server worked. */
  connected: boolean;
  /** Actions saved on this device and not yet acknowledged. */
  pendingCount: number;
  /** Acknowledged-but-not-yet-rendered actions, then pending ones, in order — what the screen draws on top of the server's data. */
  overlay: QueuedBroadcastAction[];
  /** Ids of actions still waiting to be acknowledged. */
  pendingIds: ReadonlySet<string>;
  enqueue: (action: NewQueuedAction) => void;
}

const BroadcastSyncContext = createContext<BroadcastSyncValue | null>(null);

export function useBroadcastSync(): BroadcastSyncValue {
  const value = useContext(BroadcastSyncContext);
  if (!value) throw new Error("useBroadcastSync must be used inside BroadcastSyncProvider.");
  return value;
}

/** For components that also render outside the live rundown screen (the poller). */
export function useOptionalBroadcastSync(): BroadcastSyncValue | null {
  return useContext(BroadcastSyncContext);
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function readOnline(): boolean {
  return navigator.onLine;
}

/** How long a send can run before the status bar says the server isn't answering. */
const SLOW_SEND_MS = 10_000;
/** How often to check whether the server is back while it isn't. */
const PROBE_INTERVAL_MS = 15_000;
/** At most one automatic reload per this window, so a stale cached page can't loop. */
const AUTO_RELOAD_GUARD_MS = 5 * 60_000;
const AUTO_RELOAD_KEY = "log-broadcast-sync-reloaded-at";
/** Minimum gap between asking the service worker to keep a fresh copy of the page. */
const KEEP_PAGE_INTERVAL_MS = 5 * 60_000;

export function BroadcastSyncProvider({
  rundownId,
  renderedAt,
  itemLabels,
  children,
}: {
  rundownId: string;
  /** The server render's own timestamp — a new value means the screen now reflects everything acknowledged so far. */
  renderedAt: string;
  itemLabels: Record<string, string>;
  children: ReactNode;
}) {
  const router = useRouter();
  // A ref, so drain() keeps one identity across server renders (each render
  // sends a fresh labels object).
  const itemLabelsRef = useRef(itemLabels);
  useEffect(() => {
    itemLabelsRef.current = itemLabels;
  }, [itemLabels]);
  const storeRef = useRef<Promise<BroadcastQueueStore> | null>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const entriesRef = useRef<QueueEntry[]>([]);
  const [settled, setSettled] = useState<QueuedBroadcastAction[]>([]);
  const [settledFor, setSettledFor] = useState(renderedAt);
  const online = useSyncExternalStore(subscribeOnline, readOnline, () => true);
  const [reachable, setReachable] = useState(true);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const noteDisconnected = useCallback(() => {
    setOfflineSince((current) => current ?? new Date().toISOString());
  }, []);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const authBlocked = useRef(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const draining = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSequence = useRef(0);

  // A new server render reflects every action acknowledged before it was
  // requested — React's "adjust state when a prop changes" pattern.
  if (settledFor !== renderedAt) {
    setSettledFor(renderedAt);
    setSettled([]);
  }

  const commitEntries = useCallback((next: QueueEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const store = useCallback(() => {
    storeRef.current ??= openBroadcastQueueStore();
    return storeRef.current;
  }, []);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    clearTimeout(retryTimer.current);
    let changed = false;

    try {
      for (;;) {
        const next = sortEntries(entriesRef.current)[0];
        if (!next || authBlocked.current) break;
        if (!navigator.onLine) {
          noteDisconnected();
          break;
        }

        const slow = setTimeout(() => {
          setReachable(false);
          noteDisconnected();
        }, SLOW_SEND_MS);
        let response;
        try {
          response = await syncBroadcastAction(next.action);
        } catch (error) {
          if (isDeployMismatchError(error)) {
            setNeedsReload(true);
            break;
          }
          // A network failure (or a server error that threw). The action
          // stays; try again after a backoff. Replaying is safe — see
          // broadcast-queue.ts.
          setReachable(false);
          noteDisconnected();
          const updated: QueueEntry = {
            ...next,
            attempts: next.attempts + 1,
            lastError: error instanceof Error ? error.message : String(error),
          };
          commitEntries(
            entriesRef.current.map((entry) =>
              entry.action.id === next.action.id ? updated : entry,
            ),
          );
          await store()
            .then((s) => s.put(updated))
            .catch(() => undefined);
          retryTimer.current = setTimeout(() => void drain(), retryDelayMs(updated.attempts));
          break;
        } finally {
          clearTimeout(slow);
        }

        setReachable(true);
        if (response.status === "unauthenticated") {
          authBlocked.current = true;
          setAuthMessage(response.message);
          break;
        }

        // Removing it from storage can fail without harm: a leftover entry
        // replays after a reload and is refused or absorbed as a duplicate.
        await store()
          .then((s) => s.remove(next.action.id))
          .catch(() => undefined);
        commitEntries(entriesRef.current.filter((entry) => entry.action.id !== next.action.id));
        changed = true;
        if (response.status === "ok") {
          setSettled((current) => [...current, next.action]);
        } else {
          const text = describeQueuedAction(next.action, itemLabelsRef.current[next.action.itemId]);
          setRejections((current) => [
            ...current,
            { id: next.action.id, text, message: response.message },
          ]);
        }
      }
    } finally {
      draining.current = false;
    }

    if (changed && entriesRef.current.length === 0) router.refresh();
  }, [commitEntries, noteDisconnected, router, store]);

  // Load whatever an earlier visit (a reload, a crash) left unsent, then send it.
  useEffect(() => {
    let cancelled = false;
    void store().then(async (s) => {
      if (cancelled) return;
      setPersistent(s.persistent);
      const saved = await s.load(rundownId).catch(() => [] as QueueEntry[]);
      if (cancelled || saved.length === 0) return;
      const known = new Set(entriesRef.current.map((entry) => entry.action.id));
      const merged = [
        ...saved.filter((entry) => !known.has(entry.action.id)),
        ...entriesRef.current,
      ];
      lastSequence.current = Math.max(
        lastSequence.current,
        ...merged.map((entry) => entry.sequence),
      );
      commitEntries(merged);
      void drain();
    });
    return () => {
      cancelled = true;
    };
  }, [commitEntries, drain, rundownId, store]);

  const enqueue = useCallback(
    (partial: NewQueuedAction) => {
      const action = {
        ...partial,
        id: crypto.randomUUID(),
        rundownId,
        occurredAt: new Date().toISOString(),
      } as QueuedBroadcastAction;
      lastSequence.current = Math.max(Date.now(), lastSequence.current + 1);
      const entry: QueueEntry = {
        action,
        sequence: lastSequence.current,
        attempts: 0,
        lastError: null,
      };
      commitEntries([...entriesRef.current, entry]);
      // Written to IndexedDB before the first send, so a crash mid-send
      // still leaves it on this device.
      void store()
        .then((s) => s.put(entry))
        .catch(() => setPersistent(false))
        .finally(() => void drain());
    },
    [commitEntries, drain, rundownId, store],
  );

  // Coming back online, or back to the tab: send what's waiting.
  useEffect(() => {
    const handleOnline = () => void drain();
    const handleVisible = () => {
      if (document.visibilityState === "visible") void drain();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", noteDisconnected);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", noteDisconnected);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [drain, noteDisconnected]);

  const connected = online && reachable;
  // Cleared the render connectivity returns ("adjust state when a prop
  // changes"); set by noteDisconnected at the moment it's lost.
  if (connected && offlineSince !== null) setOfflineSince(null);

  // "Online" with nothing getting through (captive portal, a dead uplink
  // behind a live Wi-Fi link): check periodically, so controls come back
  // and the queue resumes as soon as the server answers again.
  useEffect(() => {
    if (reachable || !online) return;
    const timer = setInterval(() => {
      void pingLog().then(
        () => {
          setReachable(true);
          void drain();
        },
        () => undefined,
      );
    }, PROBE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [drain, online, reachable]);

  // After a deploy, queued sends can't be delivered by this page's code. The
  // queue is in IndexedDB, so a reload loses nothing — do it once
  // automatically when that's safe, otherwise ask.
  useEffect(() => {
    if (!needsReload || !persistent || !navigator.onLine) return;
    try {
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) ?? 0);
      if (Date.now() - last < AUTO_RELOAD_GUARD_MS) return;
      sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [needsReload, persistent]);

  // The service worker that keeps a copy of this screen for a reload during
  // an outage (public/log-offline-sw.js). Production only — in development
  // a worker serving kept pages and build assets would fight hot reloading.
  const lastKeptAt = useRef(0);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/log-offline-sw.js").catch(() => undefined);
  }, []);
  // Keep the worker's copy current as the page re-renders through a shift —
  // at most every few minutes, since each copy is one more server render.
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator) ||
      !navigator.onLine
    )
      return;
    if (Date.now() - lastKeptAt.current < KEEP_PAGE_INTERVAL_MS) return;
    lastKeptAt.current = Date.now();
    void navigator.serviceWorker.ready.then((registration) =>
      registration.active?.postMessage({ type: "cache-page", url: window.location.pathname }),
    );
  }, [renderedAt]);

  const retryNow = useCallback(() => {
    authBlocked.current = false;
    setAuthMessage(null);
    void drain();
  }, [drain]);

  const value = useMemo<BroadcastSyncValue>(() => {
    const pending = sortEntries(entries).map((entry) => entry.action);
    return {
      connected,
      pendingCount: pending.length,
      overlay: [...settled, ...pending],
      pendingIds: new Set(pending.map((action) => action.id)),
      enqueue,
    };
  }, [connected, entries, enqueue, settled]);

  const statusValue: StatusBarState = {
    connected,
    pendingEntries: sortEntries(entries),
    persistent,
    offlineSince,
    renderedAt,
    authMessage,
    needsReload,
    rejections,
    itemLabels,
    retryNow,
    dismissRejection: (id) =>
      setRejections((current) => current.filter((rejection) => rejection.id !== id)),
  };

  return (
    <BroadcastSyncContext.Provider value={value}>
      <StatusBarContext.Provider value={statusValue}>{children}</StatusBarContext.Provider>
    </BroadcastSyncContext.Provider>
  );
}

interface StatusBarState {
  connected: boolean;
  pendingEntries: QueueEntry[];
  persistent: boolean | null;
  offlineSince: string | null;
  renderedAt: string;
  authMessage: string | null;
  needsReload: boolean;
  rejections: Rejection[];
  itemLabels: Record<string, string>;
  retryNow: () => void;
  dismissRejection: (id: string) => void;
}

const StatusBarContext = createContext<StatusBarState | null>(null);

/**
 * The live screen's connection bar, rendered inside the sticky header so it
 * stays in view at any scroll position. Renders nothing while connected
 * with nothing waiting.
 */
export function BroadcastSyncStatus() {
  const state = useContext(StatusBarContext);
  if (!state) return null;
  const {
    connected,
    pendingEntries,
    persistent,
    offlineSince,
    renderedAt,
    authMessage,
    needsReload,
    rejections,
    itemLabels,
    retryNow,
    dismissRejection,
  } = state;
  const count = pendingEntries.length;
  const waiting = `${count} action${count === 1 ? "" : "s"}`;
  const retrying = pendingEntries.some((entry) => entry.attempts > 0);

  let banner: ReactNode = null;
  let tone: "warning" | "danger" | "info" = "info";

  if (needsReload) {
    tone = "warning";
    banner = (
      <>
        <span className="font-semibold">On Air was updated while this screen was open.</span> Reload
        to send {count > 0 ? `the ${waiting} saved on this device` : "anything new"} — nothing is
        lost.{" "}
        <Button
          type="button"
          variant="secondary"
          className="ml-1 px-2 py-1 text-xs"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </>
    );
  } else if (authMessage) {
    tone = "danger";
    banner = (
      <>
        <span className="font-semibold">{authMessage}</span>{" "}
        {count > 0 && <>{waiting} saved on this device. </>}
        <a href="/login" target="_blank" rel="noreferrer" className="font-semibold underline">
          Sign in in a new tab
        </a>
        , then{" "}
        <button type="button" onClick={retryNow} className="font-semibold underline">
          send them
        </button>
        .
      </>
    );
  } else if (!connected) {
    tone = "warning";
    banner = (
      <>
        <span className="font-semibold">
          No connection{offlineSince ? ` since ${formatStationClockTime(offlineSince)}` : ""}.
        </span>{" "}
        Showing the rundown as of {formatStationClockTime(renderedAt)}.{" "}
        {count > 0 ? (
          <>
            {waiting} saved on this device — {count === 1 ? "it sends" : "they send"} when the
            connection returns.{" "}
          </>
        ) : (
          <>Aired, missed, and moves still work and send when the connection returns. </>
        )}
        Adding, editing, and submitting wait for the connection.
        {persistent === false && (
          <span className="font-semibold">
            {" "}
            This browser can&apos;t keep a copy of unsent actions — don&apos;t reload.
          </span>
        )}
      </>
    );
  } else if (count > 0) {
    banner = (
      <>
        {retrying ? "Retrying" : "Sending"} {waiting}…
      </>
    );
  }

  if (!banner && rejections.length === 0) return null;

  return (
    <div className="flex w-full basis-full flex-col gap-1.5" aria-live="polite">
      {banner && (
        <div
          role={tone === "danger" ? "alert" : "status"}
          className={cn(
            "rounded border px-3 py-2 text-xs leading-relaxed",
            tone === "warning" && "border-warning-fg/30 bg-warning-bg text-ink-900",
            tone === "danger" && "border-danger/30 bg-danger/[0.06] text-danger",
            tone === "info" && "border-brand-primary/25 bg-brand-surface/40 text-ink-700",
          )}
        >
          {banner}
          {!connected && count > 0 && (
            <ul className="mt-1 list-disc pl-5 text-ink-700">
              {pendingEntries.map((entry) => (
                <li key={entry.action.id}>
                  {describeQueuedAction(entry.action, itemLabels[entry.action.itemId])}{" "}
                  <span className="text-ink-400">
                    ({formatStationClockTime(entry.action.occurredAt)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {rejections.map((rejection) => (
        <div
          key={rejection.id}
          role="alert"
          className="flex items-start justify-between gap-2 rounded border border-danger/30 bg-danger/[0.06] px-3 py-2 text-xs text-danger"
        >
          <span>
            <span className="font-semibold">Not recorded: {rejection.text}.</span>{" "}
            {rejection.message}
          </span>
          <button
            type="button"
            onClick={() => dismissRejection(rejection.id)}
            className="shrink-0 font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Disables every form control inside it while there's no connection (or,
 * with `requireSynced`, while anything is still waiting to send) — for the
 * screen's ordinary <form action> controls, whose submit would otherwise
 * throw the page into its error boundary. A native disabled <fieldset>,
 * laid out with display: contents so it changes nothing visually.
 */
export function RequiresConnection({
  children,
  requireSynced = false,
}: {
  children: ReactNode;
  /** Also wait for the queue to empty — for actions that read the as-aired record (attest, submit). */
  requireSynced?: boolean;
}) {
  const { connected, pendingCount } = useBroadcastSync();
  const waitingOnQueue = requireSynced && pendingCount > 0;
  const blocked = !connected || waitingOnQueue;
  return (
    <fieldset disabled={blocked} className="contents">
      {children}
      {blocked && (
        <p className="mt-1 text-xs text-ink-400">
          {!connected
            ? "Waits for the connection."
            : "Waits until everything saved on this device has sent."}
        </p>
      )}
    </fieldset>
  );
}
