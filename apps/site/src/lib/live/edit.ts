// When does a live update count as "edited"? Readers are shown an "updated" label when an update's words changed after it was
// posted, and not for a re-save that changed nothing. Pure.

export interface EditableUpdate {
  headline?: string | null
  body?: unknown
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** True when the headline or the body of `next` differs from what was stored in `previous`. A fields not in `next` is unchanged. */
export function wordsChanged(previous: EditableUpdate | null | undefined, next: EditableUpdate): boolean {
  if (!previous) return false
  if (next.headline !== undefined && (next.headline ?? '').trim() !== (previous.headline ?? '').trim()) return true
  if (next.body !== undefined && !same(next.body, previous.body)) return true
  return false
}
