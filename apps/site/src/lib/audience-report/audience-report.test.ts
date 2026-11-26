import { describe, expect, it, vi } from 'vitest'

import { canSeeAudience } from '@/access/permissions'
import { ADMIN_NAV, navEntries, pruneNav } from '@/lib/admin-nav'

import { posthogReadConfig, runHogQL } from './posthog-api'
import { rangeOf, reportQueries } from './queries'
import { hoursOf, idsToName, percent, shapeReport, type Names } from './shape'

describe('the range', () => {
  it('takes only the fixed choices from the address, else the default', () => {
    expect(rangeOf({ days: '7', env: 'preview' })).toEqual({ days: 7, environment: 'preview' })
    expect(rangeOf({ days: '30', env: "production' or 1=1 --" })).toEqual({ days: 28, environment: 'production' })
    expect(rangeOf(undefined)).toEqual({ days: 28, environment: 'production' })
    expect(rangeOf({ days: ['90', '7'] })).toEqual({ days: 90, environment: 'production' })
  })
  it('puts only those choices into every query, and refuses anything else', () => {
    const queries = reportQueries({ days: 90, environment: 'preview' })
    for (const q of Object.values(queries)) {
      expect(q).toContain("interval 90 day and properties.environment = 'preview'")
    }
    expect(() => reportQueries({ days: 3 as 7, environment: 'production' })).toThrow()
    expect(() => reportQueries({ days: 7, environment: "x' or 1=1" as 'production' })).toThrow()
  })
})

const names: Names = {
  channels: { 'channel-1': 'WUWF 88.1' },
  audio: { 'audio-5': { title: 'Morning interview', href: null, adminHref: '/admin/collections/audio/5' } },
  posts: { '6': { title: 'JFK, remembered', href: '/local-news/2013-11-22/jfk', adminHref: '/admin/collections/posts/6' } },
  shows: {},
}

describe('the report', () => {
  const raw = {
    overview: [[120, 40, 55, 7200, 9]],
    daily: [['2026-11-25', 70, 30], ['2026-11-26T00:00:00', 50, 20]],
    listening: [['live', 'channel-1', 5400, 6], ['on_demand', 'audio-5', 1800, 3], ['on_demand', 'audio-9', 60, 1]],
    content: [['6', 'story', 30, 12], ['4', 'show', 10, 0]],
    appeals: [['membership', 'story', 20, 2]],
    conversions: [['monthly', 3], [null, 1]],
    sources: [['$direct', 30], ['google.com', 20]],
  }
  it('shapes each panel and names what the CMS knows', () => {
    const r = shapeReport({ days: 28, environment: 'production' }, raw, names)
    expect(r.overview).toEqual({ pageviews: 120, visitors: 40, visits: 55, listenHours: 2, listens: 9 })
    expect(r.daily?.[1]?.date).toBe('2026-11-26')
    expect(r.listening?.map((l) => [l.name, l.hours])).toEqual([['WUWF 88.1', 1.5], ['Morning interview', 0.5], ['audio-9', 0]])
    expect(r.content?.[0]).toMatchObject({ name: 'JFK, remembered', adminHref: '/admin/collections/posts/6', views: 30, engaged: 12 })
    expect(r.content?.[1]).toMatchObject({ kind: 'show', name: '#4' })
    expect(r.appeals?.[0]).toEqual({ kind: 'Membership appeal', surface: 'Story pages', shown: 20, clicked: 2 })
    expect(r.conversions?.[1]?.frequency).toBe('not chosen')
    expect(r.sources?.[0]?.domain).toBe('Direct or unknown')
  })
  it('leaves a failed panel empty and keeps the rest', () => {
    const r = shapeReport({ days: 7, environment: 'production' }, { ...raw, listening: null })
    expect(r.listening).toBeNull()
    expect(r.overview?.pageviews).toBe(120)
  })
  it('lists the ids to name, by kind', () => {
    expect(idsToName(raw)).toEqual({ channels: ['channel-1'], audio: ['audio-5', 'audio-9'], posts: ['6'], shows: ['4'] })
  })
  it('rounds hours and percentages', () => {
    expect(hoursOf(5400)).toBe(1.5)
    expect(percent(1, 3)).toBe('33.3%')
    expect(percent(1, 0)).toBe('–')
  })
})

describe('the PostHog reader', () => {
  it('is not set up without a key and a numeric project', () => {
    expect(posthogReadConfig({})).toBeNull()
    expect(posthogReadConfig({ POSTHOG_PERSONAL_API_KEY: 'phx_x', POSTHOG_PROJECT_ID: 'abc' })).toBeNull()
    expect(posthogReadConfig({ POSTHOG_PERSONAL_API_KEY: ' phx_x ', POSTHOG_PROJECT_ID: '768664' })).toEqual({ key: 'phx_x', projectId: '768664' })
  })
  it('sends the key as a bearer header and returns the rows', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [[1, 2]] }) }))
    const rows = await runHogQL({ key: 'phx_x', projectId: '768664' }, 'select 1', fetchImpl)
    expect(rows).toEqual([[1, 2]])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://us.posthog.com/api/projects/768664/query/')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer phx_x')
    expect(JSON.parse(init.body as string)).toEqual({ query: { kind: 'HogQLQuery', query: 'select 1' } })
  })
  it('reports a failure by its status only, never the body', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ detail: 'secret detail' }) }))
    await expect(runHogQL({ key: 'phx_x', projectId: '1' }, 'select 1', fetchImpl)).rejects.toThrow('PostHog returned an error (403).')
  })
})

describe('the Audience link in the sidebar', () => {
  it('sits under Data & charts and is no entity (no dashboard card, no group to set)', () => {
    const data = ADMIN_NAV.find((g) => g.label === 'Data & charts')!
    expect(data.items[0]).toEqual({ kind: 'view', slug: 'audience', label: 'Audience', path: '/audience' })
    expect(navEntries().some((e) => e.slug === 'audience')).toBe(false)
  })
  it('is shown to any staff role and to nobody without one', () => {
    for (const roles of [['editor'], ['sponsorship'], ['membership'], ['publisher'], ['administrator']]) expect(canSeeAudience({ roles })).toBe(true)
    expect(canSeeAudience({ roles: [] })).toBe(false)
    expect(canSeeAudience(null)).toBe(false)
    const pruned = pruneNav(ADMIN_NAV, (kind) => kind === 'view')
    expect(pruned.map((g) => g.label)).toEqual(['Data & charts'])
  })
})
