// The legacy-agreement migration's tuning of the shared run queue
// (docs/underwriting-traffic-redesign.md §14.5): each reading is a model call
// of a minute or two against a shared token cap, so a run reads a few at a
// time and gives a rate-limited entry a few more chances.

/** How many readings run at once when a run starts. */
export const MIGRATION_CONCURRENCY = 3;

/** How many times one entry is put back after a rate limit before it's recorded as failed. */
export const MIGRATION_MAX_RATE_LIMIT_RETRIES = 3;

/** The pause after a rate limit that suggested no wait of its own. */
export const DEFAULT_RATE_LIMIT_PAUSE_MS = 30_000;
