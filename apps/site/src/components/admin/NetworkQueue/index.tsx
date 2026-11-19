import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { userCan } from '@/access/permissions'
import { ago, audioNote, imageNote, QUEUE_VIEWS, queueFilter } from '@/lib/network/queue'

import { NetworkQueueActions } from './Actions'

/**
 * The Network queue: stories other stations and NPR published that are waiting for an editor (ROADMAP -> Network content). A custom admin
 * view at `/admin/network-queue`, drawn on the server from the real collections as the signed-in staff member, so what an editor sees is
 * what their permissions allow. Restricted stories are never here: they are filtered out before anything is saved.
 *
 * Uses Payload's own theme variables (it lives in the admin), not the public site's design tokens.
 */

const card: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 16, background: 'var(--theme-elevation-50)', display: 'grid', gap: 8 }
const muted: React.CSSProperties = { color: 'var(--theme-elevation-600)', margin: 0, fontSize: 14 }
const chip = (on: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 22,
  border: '1px solid var(--theme-elevation-300)',
  background: on ? 'var(--theme-elevation-800)' : 'var(--theme-elevation-0)',
  color: on ? 'var(--theme-elevation-0)' : 'var(--theme-text)',
  textDecoration: 'none',
})

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

type ItemView = {
  id: number | string
  title: string
  teaser?: string | null
  status: 'new' | 'held' | 'gone'
  publishedAt?: string | null
  canonicalUrl?: string | null
  source?: { id: number | string; name?: string | null } | number | string | null
  audioSkipped?: string | null
  imageDroppedAsRestricted?: boolean | null
  image?: { href?: string | null } | null
  audio?: { href?: string | null } | null
}

export async function NetworkQueue({ initPageResult, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const { payload, user } = req
  const adminRoute = payload.config.routes.admin

  if (!userCan(user as never, 'content.write')) {
    return (
      <Gutter>
        <h1>Network queue</h1>
        <p style={muted}>Your account cannot open this. Ask an administrator for the editor role.</p>
      </Gutter>
    )
  }

  const filter = queueFilter({ view: first(searchParams?.view), source: first(searchParams?.source) })
  const [items, sources] = await Promise.all([
    payload.find({ collection: 'network-items', where: filter.where, sort: '-publishedAt', limit: 50, depth: 1, user, req, overrideAccess: false }),
    payload.find({ collection: 'network-sources', where: { active: { equals: true } }, sort: 'name', limit: 100, pagination: false, depth: 0, user, req, overrideAccess: false }),
  ])
  const now = new Date()
  const href = (view: string, source: number | null) => `${adminRoute}/network-queue?view=${view}${source !== null ? `&source=${source}` : ''}`

  return (
    <Gutter>
      <h1 style={{ marginBottom: 4 }}>Network queue</h1>
      <p style={{ ...muted, maxWidth: 640 }}>
        Stories from other stations and NPR that are waiting for an editor. Nothing here is on the site until it is published. Stories NPR marks as restricted never
        appear: they are left out before anything is saved.
      </p>

      <nav aria-label="Filter the queue" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
        {QUEUE_VIEWS.map((v) => (
          <a key={v.key} href={href(v.key, filter.sourceId)} aria-current={filter.view === v.key ? 'page' : undefined} style={chip(filter.view === v.key)}>
            {v.label}
          </a>
        ))}
        <span aria-hidden="true" style={{ alignSelf: 'center', color: 'var(--theme-elevation-400)' }}>
          |
        </span>
        <a href={href(filter.view, null)} aria-current={filter.sourceId === null ? 'page' : undefined} style={chip(filter.sourceId === null)}>
          All sources
        </a>
        {sources.docs.map((s) => (
          <a key={s.id} href={href(filter.view, Number(s.id))} aria-current={filter.sourceId === Number(s.id) ? 'page' : undefined} style={chip(filter.sourceId === Number(s.id))}>
            {s.name}
          </a>
        ))}
      </nav>

      {items.docs.length === 0 ? (
        <p style={muted}>Nothing here. {sources.totalDocs === 0 ? 'There are no sources yet: add one under Network sources.' : 'New stories appear here after the next check.'}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {(items.docs as unknown as ItemView[]).map((item) => {
            const sourceName = typeof item.source === 'object' && item.source ? item.source.name : null
            const notes = [imageNote(item.imageDroppedAsRestricted), audioNote(item.audioSkipped)].filter((n): n is string => n !== null)
            return (
              <li key={item.id} style={card}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {sourceName ? <strong>{sourceName}</strong> : null}
                  {ago(item.publishedAt, now) ? <span style={muted}>{ago(item.publishedAt, now)}</span> : null}
                  {item.status === 'held' ? <span style={muted}>Kept for later</span> : null}
                  {item.status === 'gone' ? <strong style={{ color: 'var(--theme-warning-500)' }}>Removed at the source</strong> : null}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{item.title}</div>
                {item.teaser ? <p style={{ margin: 0 }}>{item.teaser}</p> : null}
                <p style={muted}>
                  {item.image?.href ? 'Has a picture' : 'No picture'}. {item.audio?.href ? 'Has audio.' : 'No audio.'}
                  {item.canonicalUrl ? (
                    <>
                      {' '}
                      <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer">
                        Open the original
                      </a>
                    </>
                  ) : null}
                </p>
                {notes.map((n) => (
                  <p key={n} style={{ ...muted, color: 'var(--theme-warning-500)' }}>
                    {n}
                  </p>
                ))}
                <NetworkQueueActions id={item.id} status={item.status} />
              </li>
            )
          })}
        </ul>
      )}
      {items.totalDocs > items.docs.length ? <p style={muted}>Showing the newest {items.docs.length} of {items.totalDocs}.</p> : null}
    </Gutter>
  )
}
