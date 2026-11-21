/**
 * How long network stories are kept. Pure. ROADMAP -> Network content, item 7: untouched `new` stories go after a while; a story kept for later is
 * flagged stale, never deleted; a dismissed story keeps its tombstone; a published one stays while it is published.
 *
 * These are constants for now. The roadmap's plan is Site settings (clamped, like the embeddings thresholds); that is a schema change of its own.
 */

export const RETENTION = { newStoryDays: 30, heldStaleDays: 30 } as const

const DAY_MS = 86_400_000

export type RetentionCutoffs = {
  /** `new` stories not seen since before this are deleted. */
  deleteNewBefore: Date
  /** `held` stories untouched since before this are shown as stale. */
  staleHeldBefore: Date
}

export function retentionCutoffs(now: Date, rules: { newStoryDays: number; heldStaleDays: number } = RETENTION): RetentionCutoffs {
  return {
    deleteNewBefore: new Date(now.getTime() - rules.newStoryDays * DAY_MS),
    staleHeldBefore: new Date(now.getTime() - rules.heldStaleDays * DAY_MS),
  }
}
