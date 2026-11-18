import type { Where } from 'payload'

/**
 * Which stories the sitemaps list: published, and WUWF's own. Kept apart from `sitemap-data.ts` (which needs Next's cache and a database)
 * so a test can use the same condition.
 *
 * A story from NPR or another station carries `rel=canonical` to its original publisher, so listing it would only ask search engines to
 * look at a page we tell them is a copy (ROADMAP -> Network content).
 */

export const published = { _status: { equals: 'published' } } as const

export const sitemapStories: Where = { and: [{ ...published }, { source: { equals: 'wuwf' } }] }
