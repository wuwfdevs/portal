import { Gutter } from '@payloadcms/ui'
import type { ListViewServerProps } from 'payload'
import React from 'react'

import { userCan } from '@/access/permissions'
import { ago, audioNote, imageNote, pageRange, PUBLISH_AVAILABLE, QUEUE_PAGE_SIZE, QUEUE_VIEWS, queueFilter, queueHref, queuePage, thumbnailHref } from '@/lib/network/queue'

import { SourceFilter } from './SourceFilter'
import { QueueTable, type QueueRow } from './Table'
import './queue.scss'

/**
 * The Network queue: stories other stations and NPR published that are waiting for an editor (ROADMAP -> Network content). It is the list
 * view of the Network stories collection, so there is one screen, not a queue beside a list of the same rows. Drawn on the server from the
 * real collections as the signed-in staff member, so what an editor sees is what their permissions allow. Restricted stories are never
 * here: they are filtered out before anything is saved.
 *
 * It uses Payload's theme variables (it lives in the admin), which `app/(payload)/custom.scss` maps to the WUWF design tokens.
 */

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

type Doc = {
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

export async function NetworkQueue({ payload, user, searchParams }: ListViewServerProps) {
  const adminRoute = payload.config.routes.admin
  const base = `${adminRoute}/collections/network-items`

  if (!userCan(user as never, 'content.write')) {
    return (
      <Gutter>
        <h1>Network queue</h1>
        <p className="wuwf-queue__muted">Your account cannot open this. Ask an administrator for the editor role.</p>
      </Gutter>
    )
  }

  const filter = queueFilter({ view: first(searchParams?.view), source: first(searchParams?.source) })
  const requestedPage = queuePage(first(searchParams?.page))

  const [sources, ...counts] = await Promise.all([
    payload.find({ collection: 'network-sources', where: { active: { equals: true } }, sort: 'name', limit: 100, pagination: false, depth: 0, user, overrideAccess: false }),
    // One count per tab, for the chosen source, so a tab says how much is behind it.
    ...QUEUE_VIEWS.map((v) => payload.count({ collection: 'network-items', where: queueFilter({ view: v.key, source: filter.sourceId !== null ? String(filter.sourceId) : undefined }).where, user, overrideAccess: false })),
  ])
  const countFor = Object.fromEntries(QUEUE_VIEWS.map((v, i) => [v.key, counts[i].totalDocs])) as Record<string, number>

  const total = countFor[filter.view]
  const range = pageRange(requestedPage, QUEUE_PAGE_SIZE, total)
  const page = Math.min(requestedPage, range.pages)
  const items = await payload.find({ collection: 'network-items', where: filter.where, sort: '-publishedAt', limit: QUEUE_PAGE_SIZE, page, depth: 1, user, overrideAccess: false })

  const now = new Date()
  const rows: QueueRow[] = (items.docs as unknown as Doc[]).map((item) => ({
    id: String(item.id),
    title: item.title,
    teaser: item.teaser ?? null,
    status: item.status,
    source: typeof item.source === 'object' && item.source ? (item.source.name ?? null) : null,
    found: ago(item.publishedAt, now),
    image: thumbnailHref(item.image?.href),
    hasAudio: Boolean(item.audio?.href),
    original: item.canonicalUrl ?? null,
    notes: [imageNote(item.imageDroppedAsRestricted), audioNote(item.audioSkipped)].filter((n): n is string => n !== null),
    detailHref: `${base}/${item.id}`,
  }))

  const href = (state: { view?: typeof filter.view; source?: number | null; page?: number }) => queueHref(base, { view: filter.view, source: filter.sourceId, ...state })
  const sourceList = sources.docs.map((s) => ({ id: Number(s.id), name: String(s.name) }))
  const sourceHrefs = Object.fromEntries([['', href({ source: null, page: 1 })], ...sourceList.map((s) => [String(s.id), href({ source: s.id, page: 1 })] as const)])

  return (
    <Gutter>
      <div className="wuwf-queue">
        <header className="wuwf-queue__head">
          <h1>Network queue</h1>
          <p className="wuwf-queue__muted">
            Stories from other stations and NPR that are waiting for an editor. Nothing here is on the site until it is published. Stories NPR marks as restricted never appear: they
            are left out before anything is saved.
          </p>
          {!PUBLISH_AVAILABLE ? (
            <p className="wuwf-queue__banner" role="note">
              <strong>Publishing is not available yet.</strong> It needs the story converter, which waits on the site’s NPR key. Until then you can keep stories for later or dismiss the
              ones you will not use.
            </p>
          ) : null}
        </header>

        <div className="wuwf-queue__filters">
          <nav className="wuwf-queue__tabs" aria-label="Which stories">
            {QUEUE_VIEWS.map((v) => (
              <a key={v.key} href={href({ view: v.key, page: 1 })} aria-current={filter.view === v.key ? 'page' : undefined} className="wuwf-queue__tab">
                {v.label} <span className="wuwf-queue__count">{countFor[v.key]}</span>
              </a>
            ))}
          </nav>
          {sourceList.length > 0 ? <SourceFilter sources={sourceList} current={filter.sourceId} hrefFor={sourceHrefs} /> : null}
        </div>

        {rows.length === 0 ? (
          <p className="wuwf-queue__empty">
            {sourceList.length === 0
              ? 'There are no sources yet. Add one under Network sources, and its stories will appear here after the next check.'
              : filter.view === 'waiting'
                ? 'Nothing is waiting. New stories appear here after the next check.'
                : filter.view === 'held'
                  ? 'Nothing is kept for later.'
                  : 'No story has been removed at its source.'}
          </p>
        ) : (
          <QueueTable rows={rows} />
        )}

        {total > QUEUE_PAGE_SIZE ? (
          <nav className="wuwf-queue__pages" aria-label="Pages of stories">
            {page > 1 ? <a href={href({ page: page - 1 })}>← Newer</a> : <span />}
            <span className="wuwf-queue__muted">
              {range.from} to {range.to} of {total}
            </span>
            {page < range.pages ? <a href={href({ page: page + 1 })}>Older →</a> : <span />}
          </nav>
        ) : null}
      </div>
    </Gutter>
  )
}

export default NetworkQueue
