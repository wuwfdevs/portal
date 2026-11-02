/**
 * The persistent half of the live rundown's offline queue: the host's
 * unsent actions, kept in this browser's IndexedDB so a reload, a crash, or
 * a closed tab doesn't lose them (see broadcast-queue.ts for the queue's
 * rules). Browser-only; imported by the rundown screen's client provider.
 *
 * Deliberately a tiny hand-rolled wrapper, not a dependency — one object
 * store, four operations. When IndexedDB isn't available (a private window
 * that blocks it, an old browser), `openBroadcastQueueStore()` falls back to
 * memory and says so, and the screen tells the host their actions won't
 * survive a reload — degraded, never silently.
 */

import type { QueueEntry } from "./broadcast-queue";

const DB_NAME = "wuwf-log";
const DB_VERSION = 1;
const STORE = "broadcast-queue";

interface StoredEntry extends QueueEntry {
  /** Duplicated from action.id — the object store's key. */
  id: string;
  rundownId: string;
}

export interface BroadcastQueueStore {
  /** False when this fell back to memory. */
  persistent: boolean;
  load(rundownId: string): Promise<QueueEntry[]>;
  put(entry: QueueEntry): Promise<void>;
  remove(actionId: string): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("rundownId", "rundownId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab."));
  });
}

function toEntry({ action, sequence, attempts, lastError }: StoredEntry): QueueEntry {
  return { action, sequence, attempts, lastError };
}

function memoryStore(): BroadcastQueueStore {
  const entries = new Map<string, StoredEntry>();
  return {
    persistent: false,
    async load(rundownId) {
      return [...entries.values()].filter((entry) => entry.rundownId === rundownId).map(toEntry);
    },
    async put(entry) {
      entries.set(entry.action.id, {
        ...entry,
        id: entry.action.id,
        rundownId: entry.action.rundownId,
      });
    },
    async remove(actionId) {
      entries.delete(actionId);
    },
  };
}

export async function openBroadcastQueueStore(): Promise<BroadcastQueueStore> {
  let db: IDBDatabase;
  try {
    if (typeof indexedDB === "undefined") return memoryStore();
    db = await openDatabase();
  } catch {
    return memoryStore();
  }

  // A write resolves on the transaction's complete event, not the request's
  // success — only then is the entry actually durable.
  const write = (apply: (store: IDBObjectStore) => void) =>
    new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      apply(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

  return {
    persistent: true,
    async load(rundownId) {
      const rows = await request<StoredEntry[]>(
        db.transaction(STORE, "readonly").objectStore(STORE).index("rundownId").getAll(rundownId),
      );
      return rows.map(toEntry);
    },
    async put(entry) {
      await write((store) =>
        store.put({ ...entry, id: entry.action.id, rundownId: entry.action.rundownId }),
      );
    },
    async remove(actionId) {
      await write((store) => store.delete(actionId));
    },
  };
}
