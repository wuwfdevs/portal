import type { Metadata } from 'next'

import configPromise from '@payload-config'
import { draftMode } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import React, { cache } from 'react'

import type { Contributor, Post } from '@/payload-types'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Avatar, AuthorBox, Chip, MembershipAppeal } from '@/components/Article/Parts'
import { Card } from '@/components/Card'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { Media } from '@/components/Media'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import RichText from '@/components/RichText'
import { formatLongDate } from '@/lib/format'
import { readingMinutes } from '@/lib/reading'
import { getAcknowledgments } from '@/lib/underwriting/load'
import { generateMeta } from '@/utilities/generateMeta'
import { getCachedGlobal } from '@/utilities/getGlobals'

// A campaign agreement shows only while its term runs, and a deleted agreement cannot name the pages it
// reached, so articles also refresh on a schedule.
export const revalidate = 3600

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const posts = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: { slug: true },
  })
  return posts.docs.map(({ slug }) => ({ slug }))
}

type Args = { params: Promise<{ slug?: string }> }

const named = <T extends object>(value: T | string | number | null | undefined): T | null =>
  value && typeof value === 'object' ? value : null

export default async function PostPage({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { slug = '' } = await paramsPromise
  const decodedSlug = decodeURIComponent(slug)
  const url = '/posts/' + decodedSlug
  const post = await queryPostBySlug({ slug: decodedSlug })

  if (!post) return <PayloadRedirects url={url} />

  const fellowship = named(post.fellowship)
  const series = named(post.series)
  const topics = (post.categories ?? []).map((c) => named(c)).filter((c): c is NonNullable<typeof c> => c !== null)
  const byline = (post.contributors ?? []).map((c) => named<Contributor>(c)).filter((c): c is Contributor => c !== null)

  // Which funder lines this story carries comes from the agreement records, never from the story. Agreements are
  // not readable by the public (as a visitor, `fellowship.agreements` comes back as bare ids), so this goes through
  // the server-side loader, which sees them and hands back only the approved line to show.
  const payload = await getPayload({ config: configPromise })
  const acknowledgments = await getAcknowledgments(payload, post.id, 'article', new Date().toISOString())
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = named(settings?.independencePolicy)
  const independenceHref = policy?.slug ? `/${policy.slug}` : null
  const hubHref = fellowship?.slug ? `/fellowships/${fellowship.slug}` : null

  const minutes = readingMinutes(post.content)
  const more = fellowship ? await queryMoreFrom(fellowship.id, post.id) : []
  const heroImage = named(post.heroImage)

  return (
    <article className="pb-16">
      <PayloadRedirects disableNotFound url={url} />
      {draft && <LivePreviewListener />}

      <header className="container flex max-w-[52rem] flex-col gap-4 pt-8 md:pt-12">
        <div className="flex flex-wrap gap-2">
          {fellowship && <Chip href={hubHref ?? undefined} tone="teal">{fellowship.title} Fellowship</Chip>}
          {series && <Chip>Series · {series.title}</Chip>}
          {topics.map((t) => (
            <Chip key={t.id}>Topic · {t.title}</Chip>
          ))}
        </div>

        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">{post.title}</h1>
        {post.dek && <p className="font-serif text-xl text-ink-2 md:text-2xl">{post.dek}</p>}

        <div className="flex items-center gap-4 pt-2">
          {byline[0] && <Avatar name={byline[0].name} />}
          <div className="flex flex-col text-sm text-ink-3">
            {byline.length > 0 && (
              <p>
                <span className="font-bold text-ink">{byline.map((c) => c.name).join(' and ')}</span>
                {byline[0]?.title ? `, ${byline[0].title}` : ''}
              </p>
            )}
            <p>
              {formatLongDate(post.publishedAt)}
              {minutes > 0 && ` · ${minutes} min read`}
            </p>
          </div>
        </div>

        <Acknowledgment hubHref={hubHref} independenceHref={independenceHref} lines={acknowledgments.lines} />
      </header>

      {heroImage && (
        <figure className="container mt-8 max-w-[52rem]">
          <Media imgClassName="rounded-sm" resource={heroImage} />
        </figure>
      )}

      <div className="container mt-8 flex flex-col gap-10">
        <RichText
          className="mx-auto w-full max-w-[47.5rem] font-serif prose-p:text-xl prose-p:leading-relaxed"
          data={post.content}
          enableGutter={false}
        />

        <div className="mx-auto flex w-full max-w-[47.5rem] flex-col gap-8">
          {fellowship && (
            <section aria-labelledby="about-heading" className="flex flex-col gap-2 border-t border-rule pt-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-ink-3" id="about-heading">
                About this reporting
              </h2>
              <p className="text-base text-ink-2">
                This story is part of the {fellowship.title} Fellowship.
                {fellowship.summary ? ` ${fellowship.summary}` : ''} Edited by WUWF News.
              </p>
            </section>
          )}
          {byline.map((c) => (
            <AuthorBox contributor={c} key={c.id} />
          ))}
          <MembershipAppeal />
        </div>
      </div>

      {fellowship && more.length > 0 && (
        <section aria-labelledby="more-heading" className="container mt-16 flex flex-col gap-6">
          <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
            <h2 className="font-serif text-2xl font-bold" id="more-heading">
              More from {fellowship.title}
            </h2>
            {hubHref && (
              <Link className="text-sm font-bold text-wuwf-blue-700" href={hubHref}>
                Explore the project
              </Link>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {more.map((doc) => (
              <Card doc={doc} key={doc.id} relationTo="posts" showCategories />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug = '' } = await paramsPromise
  const post = await queryPostBySlug({ slug: decodeURIComponent(slug) })
  return generateMeta({ doc: post })
}

const queryPostBySlug = cache(async ({ slug }: { slug: string }): Promise<Post | null> => {
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'posts',
    depth: 1,
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return result.docs?.[0] || null
})

const queryMoreFrom = cache(async (fellowshipId: string | number, exceptId: string | number) => {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit: 4,
    overrideAccess: false,
    pagination: false,
    sort: '-publishedAt',
    select: { title: true, slug: true, categories: true, meta: true },
    where: { and: [{ fellowship: { equals: fellowshipId } }, { id: { not_equals: exceptId } }] },
  })
  return result.docs
})
