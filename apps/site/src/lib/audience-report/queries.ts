// The questions the Audience screen asks PostHog, as HogQL. Pure.
//
// Every value that reaches a query is one of a fixed list (`RANGES`, `ENVIRONMENTS`) chosen here, never text from the request, so no query
// can be steered by an address bar. The events and their properties are the site's own (`lib/analytics/events.ts`) and PostHog's
// standard ones (`$pageview`, `$referring_domain`, `$session_id`).

export const RANGES = [7, 28, 90] as const
export type RangeDays = (typeof RANGES)[number]
export const DEFAULT_RANGE: RangeDays = 28

/** `production` is the public site; `preview` is staging (every event carries it, `lib/analytics/dispatch.ts`). */
export const ENVIRONMENTS = ['production', 'preview'] as const
export type ReportEnvironment = (typeof ENVIRONMENTS)[number]

export interface ReportRange {
  days: RangeDays
  environment: ReportEnvironment
}

/** The range from the screen's address (`?days=28&env=preview`); anything else is the default. */
export function rangeOf(params: { days?: unknown; env?: unknown } | undefined): ReportRange {
  const days = Number(Array.isArray(params?.days) ? params?.days[0] : params?.days)
  const env = Array.isArray(params?.env) ? params?.env[0] : params?.env
  return {
    days: (RANGES as readonly number[]).includes(days) ? (days as RangeDays) : DEFAULT_RANGE,
    environment: (ENVIRONMENTS as readonly unknown[]).includes(env) ? (env as ReportEnvironment) : 'production',
  }
}

/** The filter every query starts with: the range and the environment. Built only from the fixed lists above. */
function where({ days, environment }: ReportRange): string {
  if (!(RANGES as readonly number[]).includes(days) || !(ENVIRONMENTS as readonly string[]).includes(environment)) throw new Error('Unknown range')
  return `timestamp > now() - interval ${days} day and properties.environment = '${environment}'`
}

export type QueryName = 'overview' | 'daily' | 'listening' | 'content' | 'appeals' | 'conversions' | 'sources'

/** How many rows a list shows. */
export const TOP = 15

/** The queries, by name. Each returns rows of plain values, in the column order `shape.ts` reads. */
export function reportQueries(range: ReportRange): Record<QueryName, string> {
  const w = where(range)
  return {
    // Page views, visitors (by PostHog's anonymous id), visits (sessions), and listening hours, for the headline figures.
    overview: `select
        countIf(event = '$pageview'),
        count(distinct if(event = '$pageview', distinct_id, null)),
        count(distinct if(event = '$pageview', $session_id, null)),
        sumIf(toFloat(properties.seconds), event = 'listen_stopped'),
        countIf(event = 'listen_started')
      from events where ${w} and event in ('$pageview', 'listen_stopped', 'listen_started')`,
    // Page views and visitors by station day (the project's timezone is America/Chicago).
    daily: `select toDate(timestamp), count(), count(distinct distinct_id)
      from events where ${w} and event = '$pageview'
      group by 1 order by 1`,
    // Listening: hours and listens per stream (a live channel's key or an on-demand track's id).
    listening: `select properties.source, properties.stream_id, sum(toFloat(properties.seconds)), count()
      from events where ${w} and event = 'listen_stopped' and properties.stream_id is not null
      group by 1, 2 order by 3 desc limit ${TOP}`,
    // The most viewed stories, episodes and shows, with how many views became engaged reads or plays.
    content: `select properties.content_id, properties.content_kind,
        countIf(event = 'content_viewed'), countIf(event = 'content_engaged')
      from events where ${w} and event in ('content_viewed', 'content_engaged') and properties.content_id is not null
      group by 1, 2 order by 3 desc limit ${TOP}`,
    // Each appeal where it is shown: seen, and clicked.
    appeals: `select properties.appeal_kind, properties.surface,
        countIf(event = 'membership_appeal_shown'), countIf(event = 'membership_appeal_clicked')
      from events where ${w} and event in ('membership_appeal_shown', 'membership_appeal_clicked')
      group by 1, 2 order by 3 desc`,
    // Clicks through to the donation form from the Give page, by how often.
    conversions: `select properties.frequency, count()
      from events where ${w} and event = 'conversion_started'
      group by 1 order by 2 desc`,
    // Where visits came from: the referring domain of each visit's page views ($direct when none).
    sources: `select coalesce(properties.$referring_domain, '$direct'), count(distinct $session_id)
      from events where ${w} and event = '$pageview'
      group by 1 order by 2 desc limit ${TOP}`,
  }
}
