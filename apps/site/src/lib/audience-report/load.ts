import 'server-only'

import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { liveChannels } from '@/lib/live/channels'
import { getCachedGlobal } from '@/utilities/getGlobals'

import { posthogReadConfig, runHogQL, type PostHogReadConfig } from './posthog-api'
import { reportQueries, type QueryName, type ReportRange } from './queries'
import { idsToName, shapeReport, type AudienceReport, type Named, type Names, type Rows } from './shape'

/** How long PostHog's answers are kept, in seconds: the screen is a daily picture, not a live counter, and PostHog's API is rate-limited. */
export const REPORT_CACHE_SECONDS = 15 * 60

/** One query's rows, kept for `REPORT_CACHE_SECONDS` per range. A failure throws, so it is never kept: the next visit asks again. */
const cachedRows = (config: PostHogReadConfig, name: QueryName, range: ReportRange, query: string) =>
  unstable_cache(() => runHogQL(config, query), ['audience-report', config.projectId, name, String(range.days), range.environment], {
    revalidate: REPORT_CACHE_SECONDS,
    tags: ['audience-report'],
  })()

/** What the CMS calls the ids in the report. Staff-only screen, so the reads see drafts too; a failed read leaves the ids unnamed. */
async function loadNames(ids: ReturnType<typeof idsToName>): Promise<Names> {
  const names: Names = { channels: {}, audio: {}, posts: {}, shows: {} }
  try {
    const settings = await getCachedGlobal('listen-live', 0)()
    for (const c of liveChannels(settings?.channels)) names.channels[c.key] = c.name
  } catch {
    // Unnamed channels show their key.
  }
  const payload = await getPayload({ config: configPromise })
  const numeric = (list: string[]) => list.map(Number).filter((n) => Number.isInteger(n) && n > 0)
  const audioIds = numeric(ids.audio.map((id) => id.replace(/^audio-/, '')))
  const reads: Promise<void>[] = []
  if (ids.posts.length)
    reads.push(
      payload
        // A staff screen: drafts and members-only stories are named too (`overrideAccess` stated, as every Local API read must).
        .find({ collection: 'posts', where: { id: { in: numeric(ids.posts) } }, select: { title: true, path: true }, depth: 0, limit: ids.posts.length, pagination: false, overrideAccess: true })
        .then((res) => {
          for (const d of res.docs) names.posts[String(d.id)] = named(d.title, d.path, `/admin/collections/posts/${d.id}`)
        }),
    )
  if (ids.shows.length)
    reads.push(
      payload
        .find({ collection: 'productions', where: { id: { in: numeric(ids.shows) } }, select: { title: true, path: true }, depth: 0, limit: ids.shows.length, pagination: false, overrideAccess: true })
        .then((res) => {
          for (const d of res.docs) names.shows[String(d.id)] = named(d.title, d.path, `/admin/collections/productions/${d.id}`)
        }),
    )
  if (audioIds.length)
    reads.push(
      payload
        .find({ collection: 'audio', where: { id: { in: audioIds } }, select: { title: true }, depth: 0, limit: audioIds.length, pagination: false, overrideAccess: true })
        .then((res) => {
          for (const d of res.docs) names.audio[`audio-${d.id}`] = named(d.title, null, `/admin/collections/audio/${d.id}`)
        }),
    )
  await Promise.allSettled(reads)
  return names
}

const named = (title: unknown, path: unknown, adminHref: string): Named => ({
  title: typeof title === 'string' && title.trim() ? title.trim() : '',
  href: typeof path === 'string' && path.startsWith('/') ? path : null,
  adminHref,
})

export type LoadedReport = { state: 'not_configured' } | { state: 'ok'; report: AudienceReport; failed: QueryName[]; projectId: string }

/** The Audience report for a range: every query at once, each panel on its own (one failing leaves the others). */
export async function loadAudienceReport(range: ReportRange): Promise<LoadedReport> {
  const config = posthogReadConfig()
  if (!config) return { state: 'not_configured' }
  const queries = reportQueries(range)
  const names = Object.keys(queries) as QueryName[]
  const settled = await Promise.allSettled(names.map((name) => cachedRows(config, name, range, queries[name])))
  const raw: Partial<Record<QueryName, Rows | null>> = {}
  const failed: QueryName[] = []
  settled.forEach((result, i) => {
    const name = names[i]!
    if (result.status === 'fulfilled') raw[name] = result.value
    else {
      raw[name] = null
      failed.push(name)
    }
  })
  const labels = await loadNames(idsToName(raw)).catch(() => undefined)
  return { state: 'ok', report: shapeReport(range, raw, labels), failed, projectId: config.projectId }
}
