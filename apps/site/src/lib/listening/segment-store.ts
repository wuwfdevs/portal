import type { PendingSegment } from './table'

/**
 * A copy of what a table's phone has recorded but the Portal has not yet confirmed, kept in the browser's own storage so that a
 * reload, a crash or a closed tab does not lose a conversation that cannot be recorded again. Nothing here ever leaves the phone
 * except by the upload the queue makes, and a segment is deleted the moment the Portal confirms it.
 *
 * Two kinds of record: a finished segment waiting to be sent, and the one segment still being recorded, rewritten as it grows so
 * that a crash loses seconds, not up to five minutes. A recovered open segment is shorter than it should be and is sent as it is.
 */
export interface SegmentStore {
  /** A finished segment, waiting to be sent. */
  put(segment: PendingSegment): Promise<void>
  remove(seq: number): Promise<void>
  /** Everything waiting, including a recovered open segment, oldest first. */
  all(): Promise<PendingSegment[]>
  /** The segment being recorded now, as much of it as exists. Replaces the previous copy. */
  putOpen(segment: PendingSegment): Promise<void>
  /** The open segment is finished (or discarded): its record goes. */
  clearOpen(seq: number): Promise<void>
  /** The conversation is over and confirmed: everything goes. */
  clear(): Promise<void>
}

/** In memory only: for tests, and for a browser that will not give us storage (the page then says there is no backup). */
export function memorySegmentStore(): SegmentStore & { size(): number } {
  const done = new Map<number, PendingSegment>()
  let open: PendingSegment | null = null
  return {
    async put(segment) {
      done.set(segment.seq, segment)
    },
    async remove(seq) {
      done.delete(seq)
    },
    async all() {
      const list = [...done.values()]
      if (open && !done.has(open.seq)) list.push(open)
      return list.sort((a, b) => a.seq - b.seq)
    },
    async putOpen(segment) {
      open = segment
    },
    async clearOpen(seq) {
      if (open?.seq === seq) open = null
    },
    async clear() {
      done.clear()
      open = null
    },
    size: () => done.size + (open ? 1 : 0),
  }
}

const DB_NAME = 'wuwf-listening-table'
const STORE = 'segments'

interface Row {
  seq: number
  blob: Blob
  durationMs: number
  contentType: string
  startedAt?: string
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * The browser's IndexedDB, keyed by the table so that two tables opened on one phone never mix. Returns null when the browser has
 * no IndexedDB or will not open it (some private windows): the caller then records without a backup and says so.
 */
export async function openSegmentStore(tableKey: string): Promise<SegmentStore | null> {
  if (typeof indexedDB === 'undefined') return null
  let db: IDBDatabase
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opened = indexedDB.open(DB_NAME, 1)
      opened.onupgradeneeded = () => opened.result.createObjectStore(STORE)
      opened.onsuccess = () => resolve(opened.result)
      opened.onerror = () => reject(opened.error)
      opened.onblocked = () => reject(new Error('blocked'))
    })
  } catch {
    return null
  }

  const doneKey = (seq: number) => `${tableKey}/done/${String(seq).padStart(4, '0')}`
  const openKey = `${tableKey}/open`
  const range = IDBKeyRange.bound(`${tableKey}/`, `${tableKey}/￿`)
  const store = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE)
  const toSegment = (row: Row): PendingSegment => ({ seq: row.seq, blob: row.blob, durationMs: row.durationMs, contentType: row.contentType, ...(row.startedAt ? { startedAt: row.startedAt } : {}) })
  const toRow = (segment: PendingSegment): Row => ({ seq: segment.seq, blob: segment.blob, durationMs: segment.durationMs, contentType: segment.contentType, ...(segment.startedAt ? { startedAt: segment.startedAt } : {}) })

  return {
    async put(segment) {
      await request(store('readwrite').put(toRow(segment), doneKey(segment.seq)))
    },
    async remove(seq) {
      await request(store('readwrite').delete(doneKey(seq)))
    },
    async all() {
      const rows = (await request(store('readonly').getAll(range))) as Row[]
      const seen = new Set<number>()
      const list: PendingSegment[] = []
      // Keys sort finished copies ("…/done/…") before the open one ("…/open"), so a finished copy wins over an open copy of the same segment.
      for (const row of rows) {
        if (seen.has(row.seq)) continue
        seen.add(row.seq)
        list.push(toSegment(row))
      }
      return list.sort((a, b) => a.seq - b.seq)
    },
    async putOpen(segment) {
      await request(store('readwrite').put(toRow(segment), openKey))
    },
    async clearOpen(seq) {
      const existing = (await request(store('readonly').get(openKey))) as Row | undefined
      if (existing && existing.seq === seq) await request(store('readwrite').delete(openKey))
    },
    async clear() {
      await request(store('readwrite').delete(range))
    },
  }
}
