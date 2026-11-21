/**
 * A small in-memory cache whose entries are really gone after their time, not just ignored. Pure (no Payload, no network).
 *
 * Used for search-query vectors. The privacy wording (`notice.ts`) promises they are discarded after an hour, so expiry cannot wait for
 * the next search or for the cache to fill: each entry removes itself when its time is up. The timer is unreferenced, so it never keeps a
 * process alive. The oldest entry goes first when the cache is full.
 */
export type TtlCache<V> = {
  get(key: string): V | undefined
  set(key: string, value: V): void
  readonly size: number
}

export function ttlCache<V>(ttlMs: number, limit: number): TtlCache<V> {
  const entries = new Map<string, { value: V; timer: ReturnType<typeof setTimeout> }>()

  const drop = (key: string) => {
    const entry = entries.get(key)
    if (!entry) return
    clearTimeout(entry.timer)
    entries.delete(key)
  }

  return {
    get: (key) => entries.get(key)?.value,
    set(key, value) {
      drop(key)
      if (entries.size >= limit) drop(entries.keys().next().value as string)
      const timer = setTimeout(() => entries.delete(key), ttlMs)
      timer.unref?.()
      entries.set(key, { value, timer })
    },
    get size() {
      return entries.size
    },
  }
}
