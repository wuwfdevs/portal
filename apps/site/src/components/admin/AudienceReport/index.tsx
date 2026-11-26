import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { canSeeAudience } from '@/access/permissions'
import { posthogProjectUrl } from '@/lib/audience-report/posthog-api'
import { ENVIRONMENTS, RANGES, rangeOf, type QueryName, type ReportRange } from '@/lib/audience-report/queries'
import { percent, type AudienceReport } from '@/lib/audience-report/shape'

import './audience.scss'

/**
 * The Analytics screen (`/admin/audience`, Audience > Analytics in the sidebar): how readers and listeners use the site, read from PostHog by the site's
 * server with a read-only key (`lib/audience-report`). Totals only, never a person or a replay; "Open in PostHog" is the way to those. The admin
 * login is the lock: the screen checks the person itself (`canSeeAudience`), and nothing about it is public.
 *
 * Written for the admin, so it uses Payload's theme variables (`audience.scss`), as the Delivery panel does.
 */

const fmt = (n: number) => n.toLocaleString('en-US')
const RANGE_LABEL: Record<number, string> = { 7: 'Last 7 days', 28: 'Last 28 days', 90: 'Last 90 days' }
const ENV_LABEL: Record<string, string> = { production: 'Public site', preview: 'Staging' }
const PANEL_LABEL: Record<QueryName, string> = {
  overview: 'the headline figures',
  daily: 'visits by day',
  listening: 'listening',
  content: 'top content',
  appeals: 'membership appeals',
  conversions: 'clicks to give',
  sources: 'where visits come from',
}

export async function AudienceReportView({ initPageResult, searchParams, params, i18n, payload }: AdminViewServerProps) {
  const viewer = initPageResult.req.user
  if (!viewer) redirect(`${payload.config.routes.admin}/login`)
  const range = rangeOf(searchParams as { days?: unknown; env?: unknown })
  // A new custom view is rendered bare, so it wraps itself in Payload's template, with what Payload's own views pass it. A custom view gets the
  // person's permissions only inside `initPageResult`; without them the sidebar (`components/admin/Nav`) hides every collection and global.
  // The entity lists are copied, as Payload does, because React 19 refuses the read-only originals.
  const { permissions, locale, visibleEntities } = initPageResult
  const template = {
    i18n,
    locale,
    params,
    payload,
    permissions,
    req: initPageResult.req,
    searchParams,
    user: viewer,
    visibleEntities: { collections: [...(visibleEntities?.collections ?? [])], globals: [...(visibleEntities?.globals ?? [])] },
  }

  if (!canSeeAudience(viewer as Parameters<typeof canSeeAudience>[0])) {
    return (
      <DefaultTemplate {...template}>
        <Gutter>
          <h1>Analytics</h1>
          <p>Your account does not have access to this screen.</p>
        </Gutter>
      </DefaultTemplate>
    )
  }

  const { loadAudienceReport } = await import('@/lib/audience-report/load')
  const loaded = await loadAudienceReport(range).catch(() => null)

  return (
    <DefaultTemplate {...template}>
      <Gutter className="wuwf-audience">
        <header className="wuwf-audience__head">
          <div>
            <h1>Analytics</h1>
            <p className="wuwf-audience__muted">
              How people use WUWF.org, from PostHog. Totals for visitors who did not decline analytics; refreshed every 15 minutes. Times are Central.
            </p>
          </div>
          {loaded && loaded.state === 'ok' && (
            <a className="btn btn--style-secondary btn--size-medium" href={posthogProjectUrl(loaded.projectId)} rel="noopener noreferrer" target="_blank">
              Open in PostHog
            </a>
          )}
        </header>

        <RangePicker range={range} base={`${payload.config.routes.admin}/audience`} />

        {!loaded ? (
          <p className="wuwf-audience__error">The report could not be loaded. Try again in a few minutes.</p>
        ) : loaded.state === 'not_configured' ? (
          <p className="wuwf-audience__notice">
            PostHog is not set up on this server. It needs <code>POSTHOG_PERSONAL_API_KEY</code> (a read-only key) and <code>POSTHOG_PROJECT_ID</code> (see <code>.env.example</code>).
          </p>
        ) : (
          <Report failed={loaded.failed} report={loaded.report} />
        )}
      </Gutter>
    </DefaultTemplate>
  )
}

function RangePicker({ range, base }: { range: ReportRange; base: string }) {
  const href = (days: number, env: string) => `${base}?days=${days}&env=${env}`
  return (
    <nav aria-label="Report range" className="wuwf-audience__range">
      <ul>
        {RANGES.map((d) => (
          <li key={d}>
            <Link aria-current={d === range.days ? 'page' : undefined} href={href(d, range.environment)}>
              {RANGE_LABEL[d]}
            </Link>
          </li>
        ))}
      </ul>
      <ul>
        {ENVIRONMENTS.map((e) => (
          <li key={e}>
            <Link aria-current={e === range.environment ? 'page' : undefined} href={href(range.days, e)}>
              {ENV_LABEL[e]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Report({ report, failed }: { report: AudienceReport; failed: QueryName[] }) {
  const o = report.overview
  return (
    <>
      {failed.length > 0 && (
        <p className="wuwf-audience__error" role="status">
          PostHog did not answer for {failed.map((f) => PANEL_LABEL[f]).join(', ')}. The rest is shown; try again in a few minutes.
        </p>
      )}

      {o && (
        <dl className="wuwf-audience__figures">
          {[
            ['Page views', fmt(o.pageviews)],
            ['Visitors', fmt(o.visitors)],
            ['Visits', fmt(o.visits)],
            ['Listening hours', o.listenHours.toLocaleString('en-US', { maximumFractionDigits: 1 })],
            ['Listens', fmt(o.listens)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {report.daily && <Daily rows={report.daily} />}

      <div className="wuwf-audience__grid">
        <Panel empty="No listening yet in this range." rows={report.listening} title="Listening">
          {(rows) => (
            <Table head={['Stream', 'Kind', 'Hours', 'Listens']}>
              {rows.map((r) => (
                <tr key={`${r.source}:${r.streamId}`}>
                  <th scope="row">{r.name}</th>
                  <td data-label="Kind">{r.source === 'live' ? 'Live' : 'On demand'}</td>
                  <td data-label="Hours">{r.hours.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                  <td data-label="Listens">{fmt(r.listens)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel empty="No visits recorded yet in this range." rows={report.sources} title="Where visits come from">
          {(rows) => (
            <Table head={['Source', 'Visits']}>
              {rows.map((r) => (
                <tr key={r.domain}>
                  <th scope="row">{r.domain}</th>
                  <td data-label="Visits">{fmt(r.visits)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <Panel empty="No story, episode or show views yet in this range." rows={report.content} title="Top stories, episodes and shows">
        {(rows) => (
          <Table head={['Title', 'Kind', 'Views', 'Engaged', 'Engaged of views']}>
            {rows.map((r) => (
              <tr key={`${r.kind}:${r.id}`}>
                <th scope="row">
                  {r.adminHref ? <Link href={r.adminHref}>{r.name}</Link> : r.name}
                  {r.href && (
                    <>
                      {' '}
                      <a className="wuwf-audience__muted" href={r.href} rel="noopener" target="_blank">
                        (view on site)
                      </a>
                    </>
                  )}
                </th>
                <td data-label="Kind">{r.kind === 'show' ? 'Show' : r.kind === 'episode' ? 'Episode' : 'Story'}</td>
                <td data-label="Views">{fmt(r.views)}</td>
                <td data-label="Engaged">{fmt(r.engaged)}</td>
                <td data-label="Engaged of views">{percent(r.engaged, r.views)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="wuwf-audience__grid">
        <Panel empty="No appeal was seen in this range." rows={report.appeals} title="Membership appeals">
          {(rows) => (
            <Table head={['Appeal', 'Where', 'Seen', 'Clicked', 'Clicked of seen']}>
              {rows.map((r) => (
                <tr key={`${r.kind}:${r.surface}`}>
                  <th scope="row">{r.kind}</th>
                  <td data-label="Where">{r.surface}</td>
                  <td data-label="Seen">{fmt(r.shown)}</td>
                  <td data-label="Clicked">{fmt(r.clicked)}</td>
                  <td data-label="Clicked of seen">{percent(r.clicked, r.shown)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel empty="Nobody went from the Give page to the donation form in this range." rows={report.conversions} title="Clicks to the donation form">
          {(rows) => (
            <>
              <Table head={['How often', 'Clicks']}>
                {rows.map((r) => (
                  <tr key={r.frequency}>
                    <th scope="row">{r.frequency}</th>
                    <td data-label="Clicks">{fmt(r.count)}</td>
                  </tr>
                ))}
              </Table>
              <p className="wuwf-audience__muted">Clicks from the Give page only. Gifts are made on the donation form and are not counted here.</p>
            </>
          )}
        </Panel>
      </div>
    </>
  )
}

function Daily({ rows }: { rows: { date: string; pageviews: number; visitors: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.pageviews))
  return (
    <section aria-labelledby="audience-daily" className="wuwf-audience__panel">
      <h2 id="audience-daily">Page views by day</h2>
      {rows.length === 0 ? (
        <p className="wuwf-audience__muted">No visits recorded yet in this range.</p>
      ) : (
        <>
          {/* A picture of the table below it, so it is hidden from screen readers; the table carries the figures. */}
          <div aria-hidden="true" className="wuwf-audience__bars">
            {rows.map((r) => (
              <span key={r.date} style={{ height: `${Math.max(2, (r.pageviews / max) * 100)}%` }} title={`${r.date}: ${fmt(r.pageviews)}`} />
            ))}
          </div>
          <details>
            <summary>Show the figures</summary>
            <Table head={['Day', 'Page views', 'Visitors']}>
              {rows.map((r) => (
                <tr key={r.date}>
                  <th scope="row">{r.date}</th>
                  <td data-label="Page views">{fmt(r.pageviews)}</td>
                  <td data-label="Visitors">{fmt(r.visitors)}</td>
                </tr>
              ))}
            </Table>
          </details>
        </>
      )}
    </section>
  )
}

function Panel<T>({ title, rows, empty, children }: { title: string; rows: T[] | null; empty: string; children: (rows: T[]) => React.ReactNode }) {
  const id = `audience-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <section aria-labelledby={id} className="wuwf-audience__panel">
      <h2 id={id}>{title}</h2>
      {rows === null ? <p className="wuwf-audience__muted">Not available right now.</p> : rows.length === 0 ? <p className="wuwf-audience__muted">{empty}</p> : children(rows)}
    </section>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="wuwf-audience__table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

export default AudienceReportView
