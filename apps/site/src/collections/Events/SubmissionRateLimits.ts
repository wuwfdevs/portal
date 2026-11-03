import type { CollectionConfig } from 'payload'

/**
 * A short-lived ledger of who has sent events recently, so the public form can limit one address to a few an hour and a day.
 * Each row is only a keyed hash of an address (never the address) and its time; rows older than two days are deleted as new ones
 * arrive. It lives apart from events on purpose: events keep version history, and an address hash must not be kept in it.
 * Server only: nothing here is readable or writable through the API, and it has no admin screen.
 */
export const SubmissionRateLimits: CollectionConfig = {
  slug: 'submission-rate-limits',
  admin: { hidden: true },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [{ name: 'key', type: 'text', required: true, index: true }],
}
