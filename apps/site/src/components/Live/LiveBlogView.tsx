import React from 'react'

import type { LiveUpdate } from '@/payload-types'

import { FeaturedMedia } from '@/components/Article/FeaturedMedia'
import { LiveRefresh } from '@/components/Live/LiveRefresh'
import RichText from '@/components/RichText'
import { updateAuthors, type LiveBlogData } from '@/lib/live/load'
import { jsonLdText, liveBlogSchema } from '@/lib/live/jsonld'
import { formatCentral } from '@/lib/live/time'
import { getServerSideURL } from '@/utilities/getURL'

function Update({ update, pinned }: { update: LiveUpdate; pinned?: boolean }) {
  const authors = updateAuthors(update)
  // "Updated" only when the words were changed after posting (the timestamps are never equal by accident, so compare them).
  const edited = update.editedAt && update.editedAt !== update.postedAt ? update.editedAt : null
  return (
    <article className="scroll-mt-24 border-t border-rule py-6" id={update.anchor ?? undefined}>
      <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
        {pinned && <span className="rounded-pill bg-wuwf-blue-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">Pinned</span>}
        <time dateTime={update.postedAt}>{formatCentral(update.postedAt)}</time>
        {edited && <span>· Updated {formatCentral(edited)}</span>}
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold leading-snug text-ink">{update.headline}</h2>
      {authors.length > 0 && <p className="mt-1 text-sm font-semibold text-ink-2">By {authors.join(', ')}</p>}
      <div className="mt-3">
        <RichText data={update.body} enableGutter={false} />
      </div>
      {update.anchor && (
        <p className="mt-3 text-sm">
          <a className="font-semibold text-wuwf-blue-700 underline" href={`#${update.anchor}`}>
            Link to this update
          </a>
        </p>
      )}
    </article>
  )
}

/** A live blog (`/live-updates/<slug>`): the blog's header, then its updates, newest first. */
export function LiveBlogView({ data }: { data: LiveBlogData }) {
  const { blog, pinned, updates, live, startedAt, token } = data
  const total = pinned.length + updates.length
  const url = `${getServerSideURL()}/live-updates/${blog.slug}`
  const schema = liveBlogSchema({
    url,
    headline: blog.title,
    description: blog.description,
    startedAt,
    endedAt: live ? null : blog.endedAt,
    modifiedAt: blog.updatedAt,
    publisherName: 'WUWF Public Media',
    updates: [...pinned, ...updates].map((u) => ({ headline: u.headline, postedAt: u.postedAt, editedAt: u.editedAt ?? null, anchor: u.anchor ?? String(u.id) })),
  })

  return (
    <article className="pb-20">
      <script type="application/ld+json">{jsonLdText(schema)}</script>
      <header className="container flex max-w-[52rem] flex-col gap-4 pt-8 md:pt-12">
        <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest">
          {live ? (
            <span className="inline-flex items-center gap-2 rounded-pill bg-wuwf-blue-700 px-3 py-1 text-surface">
              <span aria-hidden="true" className="size-2 rounded-full bg-surface" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-pill border border-rule-strong px-3 py-1 text-ink-2">Ended{blog.endedAt ? ` · ${formatCentral(blog.endedAt)}` : ''}</span>
          )}
          <span className="text-ink-3">Live updates</span>
        </p>
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">{blog.title}</h1>
        {blog.description && <p className="font-serif text-xl text-ink-2">{blog.description}</p>}
        <p className="text-sm text-ink-3">
          Started {formatCentral(startedAt)} · {total} {total === 1 ? 'update' : 'updates'}
        </p>
      </header>

      {blog.featuredMedia && blog.featuredMedia.length > 0 && (
        <div className="container mt-8">
          <FeaturedMedia blocks={blog.featuredMedia} />
        </div>
      )}
      {blog.intro && (
        <div className="container mt-8 max-w-[52rem]">
          <RichText data={blog.intro} enableGutter={false} />
        </div>
      )}

      <div className="container mt-8 max-w-[52rem]">
        <LiveRefresh key={token} live={live} slug={blog.slug ?? ''} token={token} />
        {pinned.map((u) => (
          <Update key={u.id} pinned update={u} />
        ))}
        {updates.length === 0 && pinned.length === 0 ? (
          <p className="border-t border-rule py-8 text-base text-ink-3">{live ? 'No updates yet. They will appear here as they are posted.' : 'This blog has no updates.'}</p>
        ) : (
          updates.map((u) => <Update key={u.id} update={u} />)
        )}
      </div>
    </article>
  )
}
