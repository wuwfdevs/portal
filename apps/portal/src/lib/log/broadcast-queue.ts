/**
 * The live rundown screen's offline queue — the pure half (no IndexedDB, no
 * React, no Supabase). docs/log-design.md §6, "Host live-view resilience."
 *
 * Every action a host takes that has to survive a connectivity drop goes
 * through one queue: the two broadcast outcomes an underwriting credit can
 * get (aired, missed) and the two relocations (ordinary content, and a
 * credit). Each is written to the browser's IndexedDB first, shown on
 * screen immediately, and sent to the server in order; it leaves the queue
 * only once the server acknowledges it — the same write → upload →
 * delete-on-ack sequence Remote Interview's local capture uses for audio.
 *
 * Replays are safe because each action carries a client-generated id: an
 * outcome's id becomes its log_broadcast_events row's primary key, so a
 * send whose response was lost and is then sent again is refused by the
 * database as a duplicate and treated as success. A relocation is
 * idempotent by construction (it states where an item ends up, not a step
 * to take from where it is).
 *
 * Everything else on the screen (filling a break, editing, submitting) needs
 * the server's answer before it means anything, so it's paused while
 * offline rather than queued.
 */

import type { LogMissReason } from "@/lib/database.types";
import { backoffDelayMs } from "@/lib/backoff";

interface QueuedActionBase {
  /** Client-generated UUID. For an outcome, it is also the log_broadcast_events id. */
  id: string;
  rundownId: string;
  itemId: string;
  /** When the host took the action, per the host's device — not when it reached the server. */
  occurredAt: string;
}

export type QueuedBroadcastAction =
  | (QueuedActionBase & { kind: "outcome_aired" })
  | (QueuedActionBase & { kind: "outcome_missed"; reason: LogMissReason; notes: string | null })
  | (QueuedActionBase & {
      kind: "relocate_item";
      destinationBreakId: string;
      orderedItemIds: string[];
    })
  | (QueuedActionBase & { kind: "relocate_credit"; destinationBreakId: string });

export interface QueueEntry {
  action: QueuedBroadcastAction;
  /** Enqueue order; ties broken by action id. */
  sequence: number;
  attempts: number;
  lastError: string | null;
}

/** What the server says about one queued action. */
export type BroadcastSyncResponse =
  | { status: "ok" }
  /** The server looked at it and refused; sending it again won't help. */
  | { status: "rejected"; message: string }
  /** No usable session — keep the action and ask the host to sign in again. */
  | { status: "unauthenticated"; message: string };

export function sortEntries(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort(
    (a, b) => a.sequence - b.sequence || a.action.id.localeCompare(b.action.id),
  );
}

const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 30_000;

/** Delay before retry number `attempts` (1-based) after a network failure: 1s, 2s, 4s … capped at 30s. */
export function retryDelayMs(attempts: number): number {
  return backoffDelayMs(attempts, { baseMs: RETRY_BASE_MS, capMs: RETRY_CAP_MS });
}

/**
 * Next.js refuses a Server Action id it doesn't know — which is what every
 * queued send hits after a deploy while the screen stayed open. Retrying
 * can't fix it; reloading the page (the queue survives in IndexedDB) does.
 */
export function isDeployMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "UnrecognizedActionError" ||
    /Server Action .* was not found on the server/.test(error.message)
  );
}

/**
 * The outcome each item will have once everything queued (or just
 * acknowledged but not yet re-rendered) lands — the last one wins, the same
 * order the server applies them in.
 */
export function pendingOutcomeByItem(
  actions: QueuedBroadcastAction[],
): Map<string, "aired" | "missed"> {
  const outcomes = new Map<string, "aired" | "missed">();
  for (const action of actions) {
    if (action.kind === "outcome_aired") outcomes.set(action.itemId, "aired");
    else if (action.kind === "outcome_missed") outcomes.set(action.itemId, "missed");
  }
  return outcomes;
}

/**
 * The break-by-break item order the screen should show: the server's, with
 * every relocation not yet reflected in it applied on top, in order. An id
 * the server no longer has (an item deleted meanwhile) is dropped rather
 * than resurrected, and a relocation into a break that no longer exists is
 * skipped.
 */
export function applyPendingRelocations(
  serverOrder: Record<string, string[]>,
  actions: QueuedBroadcastAction[],
): Record<string, string[]> {
  const known = new Set(Object.values(serverOrder).flat());
  const order: Record<string, string[]> = {};
  for (const [breakId, ids] of Object.entries(serverOrder)) order[breakId] = [...ids];

  for (const action of actions) {
    if (action.kind !== "relocate_item" && action.kind !== "relocate_credit") continue;
    if (!known.has(action.itemId) || !order[action.destinationBreakId]) continue;

    if (action.kind === "relocate_item") {
      const moved = new Set(action.orderedItemIds);
      for (const breakId of Object.keys(order)) {
        order[breakId] = order[breakId]!.filter((id) => !moved.has(id));
      }
      order[action.destinationBreakId] = action.orderedItemIds.filter((id) => known.has(id));
    } else {
      for (const breakId of Object.keys(order)) {
        order[breakId] = order[breakId]!.filter((id) => id !== action.itemId);
      }
      order[action.destinationBreakId]!.push(action.itemId);
    }
  }
  return order;
}

/** How far back a queued outcome's own timestamp is trusted. Older (or unparseable) falls back to now. */
export const MAX_OCCURRED_AT_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * The recorded_at to store for an outcome the host's device timestamped:
 * the device's time, so an aired mark made offline at 6:06 and delivered at
 * 6:20 still says 6:06 — but never in the future (a fast device clock), and
 * never further back than MAX_OCCURRED_AT_AGE_MS.
 */
export function clampOccurredAt(occurredAt: string | undefined, nowMs: number): string {
  const nowISO = new Date(nowMs).toISOString();
  if (!occurredAt) return nowISO;
  const ms = new Date(occurredAt).getTime();
  if (Number.isNaN(ms) || ms > nowMs || nowMs - ms > MAX_OCCURRED_AT_AGE_MS) return nowISO;
  return new Date(ms).toISOString();
}

/** One line per action, for the status bar's list of what's waiting or what was refused. */
export function describeQueuedAction(
  action: QueuedBroadcastAction,
  itemLabel: string | undefined,
): string {
  const label = itemLabel ?? "an item";
  switch (action.kind) {
    case "outcome_aired":
      return `${label} — aired`;
    case "outcome_missed":
      return `${label} — missed`;
    case "relocate_item":
    case "relocate_credit":
      return `${label} — moved`;
  }
}
