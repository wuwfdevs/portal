// What a live page polls for: a short fingerprint that changes whenever anything a reader sees on the page changes. Pure.
//
// It covers the updates (how many there are, and the latest change to any of them, which catches an edit or a deletion) AND the
// blog itself (its own last change and whether coverage has ended), because ending a blog, changing the pinned updates or
// rewriting the introduction are all things a reader of an open page needs to be offered, and none of them touches an update.

export interface FeedState {
  /** How many updates the blog has. */
  count: number
  /** The latest `updatedAt` across its updates, or null when there are none. */
  latestUpdateAt?: string | null
  /** The blog's own `updatedAt` (its published version's last save). */
  blogUpdatedAt?: string | null
  /** `live` or `ended`. */
  coverage?: string | null
}

export const feedToken = (s: FeedState): string => [s.count, s.latestUpdateAt ?? '', s.blogUpdatedAt ?? '', s.coverage ?? ''].join('|')
