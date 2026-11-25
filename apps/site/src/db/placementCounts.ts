import type { postgresAdapter } from '@payloadcms/db-postgres'
import { date, integer, pgTable, primaryKey, text, timestamp } from '@payloadcms/db-postgres/drizzle/pg-core'

type SchemaHook = NonNullable<NonNullable<Parameters<typeof postgresAdapter>[0]['afterSchemaInit']>[number]>

/**
 * `placement_counts`: how many times each sponsor placement was put in front of someone, viewed and clicked, per station day (`ANALYTICS.md`,
 * "The placement counter"). Daily totals only: no event, visitor, address or page is ever stored, so there is nothing personal to keep or delete.
 *
 * A plain table beside Payload's, not a collection, for the reason `story_embeddings` is one: nothing here is editable, and a collection would
 * expose it through the public REST and GraphQL APIs. Declared through the adapter's schema hook so it is in Payload's migration snapshot.
 *
 * No foreign key to `placement_items`: a placement that is deleted keeps its history, because a sponsor's report outlives the tile. The zone,
 * kind and sponsor are copied from the placement when the count is made (never from the browser), so a report reads them from here.
 * `filter_version` is part of the key: a day counted under two versions of the traffic filter (`lib/analytics/filter.ts`) keeps them apart.
 * Only the server touches it, through `lib/analytics/counts.ts`.
 */
export const placementCountsSchema: SchemaHook = ({ schema }) => {
  const placementCounts = pgTable(
    'placement_counts',
    {
      day: date('day', { mode: 'string' }).notNull(),
      placementId: integer('placement_id').notNull(),
      zone: text('zone').notNull(),
      kind: text('kind').notNull(),
      sponsorId: integer('sponsor_id'),
      filterVersion: text('filter_version').notNull(),
      measurable: integer('measurable').notNull().default(0),
      viewable: integer('viewable').notNull().default(0),
      clicked: integer('clicked').notNull().default(0),
      updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ name: 'placement_counts_pkey', columns: [t.day, t.placementId, t.zone, t.filterVersion] })],
  )
  return { ...schema, tables: { ...schema.tables, placement_counts: placementCounts } }
}
