'use client'

import { useConfig, useDocumentInfo } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { DeliveryReport, Totals } from '@/lib/analytics/report'

/**
 * The "Delivery" panel: what the site counted for one placement (on its edit screen) or for all of a sponsor's placements (on the sponsor's),
 * over a range of station days, with the sponsor's export. Reads `GET /api/placement-items/delivery` (`collections/placementDeliveryEndpoints.ts`),
 * which needs the sponsorship role. Staff see exact figures; the export hides small ones and prints how they are counted.
 *
 * Written for the admin, so it uses Payload's own theme variables rather than the public site's design tokens.
 */

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 16, background: 'var(--theme-elevation-50)', marginTop: 24 }
const muted: React.CSSProperties = { color: 'var(--theme-elevation-600)', margin: 0 }
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', marginTop: 12 }
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--theme-elevation-150)', fontWeight: 600 }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--theme-elevation-100)' }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const input: React.CSSProperties = { font: 'inherit', fontSize: 16, padding: '6px 8px', border: '1px solid var(--theme-elevation-250)', borderRadius: 4, background: 'var(--theme-input-bg)', color: 'inherit' }

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '–')
const fmt = (n: number) => n.toLocaleString('en-US')

function Figures({ t }: { t: Totals }) {
  return (
    <>
      <td style={num}>{fmt(t.measurable)}</td>
      <td style={num}>{fmt(t.viewable)}</td>
      <td style={num}>{fmt(t.clicked)}</td>
      <td style={num}>{pct(t.viewable, t.measurable)}</td>
      <td style={num}>{pct(t.clicked, t.viewable)}</td>
    </>
  )
}

const HEAD = ['Shown', 'Viewed', 'Clicked', 'Viewed of shown', 'Clicked of viewed']

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
      <div style={box}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <p style={muted}>Counts appear here once the {scope === 'sponsor' ? 'sponsor' : 'placement'} is saved and running.</p>
      </div>
    )
  }

  const nothing = report && report.total.measurable + report.total.viewable + report.total.clicked === 0
  return (
    <div style={box}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <p style={muted}>
        Counted by the site itself, as daily totals: nothing about the people who saw it is kept. Not audited by a third party. A count reaches
        here within a few seconds of a visit.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', marginTop: 12 }}
      >
        <label style={{ display: 'grid', gap: 4 }}>
          First day
          <input onChange={(e) => setFrom(e.target.value)} style={input} type="date" value={from} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          Last day
          <input onChange={(e) => setTo(e.target.value)} style={input} type="date" value={to} />
        </label>
        <button className="btn btn--style-secondary btn--size-small" disabled={loading} style={{ margin: 0 }} type="submit">
          {loading ? 'Loading…' : 'Show'}
        </button>
        <a className="btn btn--style-primary btn--size-small" download href={query({ format: 'csv' })} style={{ margin: 0 }}>
          Download for the sponsor (CSV)
        </a>
      </form>
      {error && (
        <p role="alert" style={{ ...muted, color: 'var(--theme-error-500)', marginTop: 12 }}>
          {error}
        </p>
      )}
      {report && nothing && <p style={{ ...muted, marginTop: 12 }}>Nothing was counted from {report.from} to {report.to}.</p>}
      {report && !nothing && (
        <>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>{scope === 'sponsor' ? 'Message' : 'Place on the site'}</th>
                {HEAD.map((h) => (
                  <th key={h} style={{ ...th, textAlign: 'right' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.placements.map((p) => (
                <tr key={`${p.placementId}|${p.zone}`}>
                  <td style={td}>{scope === 'sponsor' ? `${p.name} (${p.place})` : p.place}</td>
                  <Figures t={p} />
                </tr>
              ))}
              {report.placements.length > 1 && (
                <tr>
                  <td style={{ ...td, fontWeight: 600 }}>Total</td>
                  <Figures t={report.total} />
                </tr>
              )}
            </tbody>
          </table>
          <button className="btn btn--style-subtle btn--size-small" onClick={() => setShowDays((v) => !v)} style={{ marginTop: 12 }} type="button">
            {showDays ? 'Hide the days' : 'Show each day'}
          </button>
          {showDays && (
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Day</th>
                  {HEAD.map((h) => (
                    <th key={h} style={{ ...th, textAlign: 'right' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.days.map((d) => (
                  <tr key={d.day}>
                    <td style={td}>{d.day}</td>
                    <Figures t={d} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ ...muted, marginTop: 12 }}>Traffic filter {report.filterVersions.join(', ')}.</p>
        </>
      )}
    </div>
  )
}

/** On a placement's edit screen. */
export const PlacementDelivery: React.FC = () => <Delivery scope="placement" />

/** On a sponsor's edit screen: every placement of the sponsor. */
export const SponsorDelivery: React.FC = () => <Delivery scope="sponsor" />
