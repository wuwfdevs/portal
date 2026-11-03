import Link from 'next/link'
import React from 'react'

import { Chip } from '@/components/Article/Parts'
import { Card } from '@/components/Card'
import { withLeadPicture } from '@/components/Card/withLeadPicture'
import { Media } from '@/components/Media'
import RichText from '@/components/RichText'
import { ListPagination } from '@/components/StoryList/ListPagination'
import type { StoryListData } from '@/lib/lists/load'

const EYEBROW = { section: 'Section', topic: 'Topic', person: 'Reporter' } as const

/**
 * A page of stories in a section, under a topic, or by a person (the three share one layout). The first page opens with the
 * newest story large and the rest in a grid; later pages are the grid alone. Empty states say so plainly.
 */
export function StoryListView({ data }: { data: StoryListData }) {
  const { kind, slug, title, blurb, bio, profile, stories, page, totalPages, totalDocs } = data
  const lead = page === 1 ? stories[0] : undefined
  const grid = page === 1 ? stories.slice(1) : stories

  return (
    <div className="pb-20">
      <header className="container flex max-w-[60rem] flex-col gap-3 pt-8 md:pt-12">
        <div>
          <Chip tone="teal">{EYEBROW[kind]}</Chip>
        </div>
        {profile ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
            {profile.photo ? (
              <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full bg-surface-3 md:h-40 md:w-40">
                <Media imgClassName="h-full w-full object-cover" resource={profile.photo} />
              </div>
            ) : (
              <span aria-hidden="true" className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-surface-3 font-sans text-4xl font-bold text-ink-2 md:h-40 md:w-40">
                {profile.initials}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-3">
              <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">{title}</h1>
              {blurb && <p className="font-serif text-xl text-ink-2">{blurb}</p>}
              {bio && <p className="max-w-[44rem] text-lg text-ink-2">{bio}</p>}
              {profile.links.length > 0 && (
                <ul aria-label={`${title} online`} className="flex flex-wrap gap-x-5 gap-y-1 font-sans text-base font-semibold">
                  {profile.links.map((l) => (
                    <li key={l.url}>
                      <a className="inline-flex min-h-11 items-center text-wuwf-blue-700 underline underline-offset-4" href={l.url} rel="noopener noreferrer nofollow">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">{title}</h1>
            {blurb && <p className="font-serif text-xl text-ink-2">{blurb}</p>}
            {bio && <p className="max-w-[44rem] text-lg text-ink-2">{bio}</p>}
          </>
        )}
        {profile?.biography && (
          <div className="mt-4 max-w-[44rem] border-t border-rule pt-6">
            <h2 className="mb-3 font-sans text-sm font-bold uppercase tracking-widest text-ink-3">About {title}</h2>
            <RichText data={profile.biography} enableGutter={false} />
          </div>
        )}
        <p className="text-sm text-ink-3">
          {totalDocs === 0 ? 'No stories yet.' : `${totalDocs} ${totalDocs === 1 ? 'story' : 'stories'}${totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}`}
        </p>
      </header>

      <section aria-label="Stories" className="container mt-10">
        {stories.length === 0 ? (
          <p className="text-base text-ink-3">
            There are no published stories here yet. <Link className="font-semibold text-wuwf-blue-700 underline" href="/">Go to the front page</Link>.
          </p>
        ) : (
          <div className="flex flex-col gap-10">
            {lead && <Card className="md:max-w-[44rem]" doc={withLeadPicture(lead)} fixedImage showCategories />}
            {grid.length > 0 && (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {grid.map((story) => (
                  <li key={story.id}>
                    <Card className="h-full" doc={withLeadPicture(story)} fixedImage showCategories />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <ListPagination kind={kind} page={page} slug={slug} totalPages={totalPages} />
      </section>
    </div>
  )
}
