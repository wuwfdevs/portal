'use client'

import { useConfig, useDocumentInfo } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { DeliveryReport, Totals } from '@/lib/analytics/report'

import './delivery.scss'

/**
 * The "Delivery" panel: what the site counted for one placement (on its edit screen) or for all of a sponsor's placements (on the sponsor's),
 * over a range of station days, with the sponsor's export. Reads `GET /api/placement-items/delivery` (`collections/placementDeliveryEndpoints.ts`),
 * which needs the sponsorship role. Staff see exact figures; the export hides small ones and prints how they are counted.
 *
 * Written for the admin, so it uses Payload's own theme variables rather than the public site's design tokens (`delivery.scss`, which also makes it
 * a table when wide and a card per row when narrow).
 */

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '–')
const fmt = (n: number) => n.toLocaleString('en-US')

const HEAD = ['Shown', 'Viewed', 'Clicked', 'Viewed of shown', 'Clicked of viewed'] as const

/** The five figures of a row, each cell carrying its column's name for the narrow layout. */
function Figures({ t }: { t: Totals }) {
  const values = [fmt(t.measurable), fmt(t.viewable), fmt(t.clicked), pct(t.viewable, t.measurable), pct(t.clicked, t.viewable)]
  return (
    <>
      {values.map((v, i) => (
        <td data-label={HEAD[i]} key={HEAD[i]}>
          {v}
        </td>
      ))}
    </>
  )
}

function Delivery({ scope }: { scope: 'placement' | 'sponsor' }) {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [report, setReport] = useState<DeliveryReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showDays, setShowDays] = useState(false)

  const base = `${config.serverURL ?? ''}${config.routes.api}/placement-items/delivery`
  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const q = new URLSearchParams({ [scope]: String(id), ...(from ? { from } : {}), ...(to ? { to } : {}), ...extra })
      return `${base}?${q.toString()}`
    },
    [base, from, id, scope, to],
  )

  /** Loads the report for the range on the form. On first load the form is empty, and the server's default range is written back into it. */
  const load = useCallback(async () => {
    if (id == null) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(query(), { credentials: 'same-origin', headers: { accept: 'application/json' } })
      const body = (await response.json().catch(() => null)) as (DeliveryReport & { error?: string }) | null
      if (!response.ok || !body || body.error) {
        setError(body?.error ?? 'The counts could not be loaded.')
        return
      }
      setReport(body)
      setFrom(body.from)
      setTo(body.to)
    } catch {
      setError('The counts could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [id, query])

  // Once, when the screen opens; after that only when "Show" is pressed (not on every keystroke in a date).
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || id == null) return
    opened.current = true
    void load()
  }, [id, load])

  const title = scope === 'sponsor' ? 'Delivery of this sponsor\'s messages' : 'Delivery'
  if (id == null) {
    return (
      <div className="wuwf-delivery">
        <h3 className="wuwf-delivery__title">{title}</h3>
        <p className="wuwf-delivery__muted">Counts appear here once the {scope === 'sponsor' ? 'sponsor' : 'placement'} is saved and running.</p>
      </div>
    )
  }

  const nothing = report && report.total.measurable + report.total.viewable + report.total.clicked === 0
  return (
    <div className="wuwf-delivery">
      <h3 className="wuwf-delivery__title">{title}</h3>
      <p className="wuwf-delivery__muted">
        Counted by the site itself, as daily totals: nothing about the people who saw it is kept. Not audited by a third party. A count reaches
        here within a few seconds of a visit.
      </p>
      {/* Not a <form>: this panel sits inside the document's own edit form, and a nested form's submit would bubble up and save the document. */}
      <div
        aria-label="Days to show"
        role="group"
        onKeyDown={(e) => {
          // Enter in a date would otherwise submit the document's form; here it means "Show".
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault()
            e.stopPropagation()
            void load()
          }
        }}
        className="wuwf-delivery__range"
      >
        <label>
          First day
          <input onChange={(e) => setFrom(e.target.value)} type="date" value={from} />
        </label>
        <label>
          Last day
          <input onChange={(e) => setTo(e.target.value)} type="date" value={to} />
        </label>
        <button className="btn btn--style-secondary btn--size-small" disabled={loading} onClick={() => void load()} type="button">
          {loading ? 'Loading…' : 'Show'}
        </button>
        <a className="btn btn--style-primary btn--size-small" download href={query({ format: 'csv' })}>
          Download for the sponsor (CSV)
        </a>
      </div>
      {error && (
        <p className="wuwf-delivery__error" role="alert">
          {error}
        </p>
      )}
      {report && nothing && <p className="wuwf-delivery__foot">Nothing was counted from {report.from} to {report.to}.</p>}
      {report && !nothing && (
        <>
          <table className="wuwf-delivery__table">
            <thead>
              <tr>
                <th scope="col">{scope === 'sponsor' ? 'Message' : 'Place on the site'}</th>
                {HEAD.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.placements.map((p) => (
                <tr key={`${p.placementId}|${p.zone}`}>
                  <td>{scope === 'sponsor' ? `${p.name} (${p.place})` : p.place}</td>
                  <Figures t={p} />
                </tr>
              ))}
              {report.placements.length > 1 && (
                <tr className="is-total">
                  <td>Total</td>
                  <Figures t={report.total} />
                </tr>
              )}
            </tbody>
          </table>
          <button aria-expanded={showDays} className="btn btn--style-subtle btn--size-small wuwf-delivery__days" onClick={() => setShowDays((v) => !v)} type="button">
            {showDays ? 'Hide the days' : 'Show each day'}
          </button>
          {showDays && (
            <table className="wuwf-delivery__table">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  {HEAD.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.days.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <Figures t={d} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="wuwf-delivery__foot">Traffic filter {report.filterVersions.join(', ')}.</p>
        </>
      )}
    </div>
  )
}

/** On a placement's edit screen. */
export const PlacementDelivery: React.FC = () => <Delivery scope="placement" />

/** On a sponsor's edit screen: every placement of the sponsor. */
export const SponsorDelivery: React.FC = () => <Delivery scope="sponsor" />
