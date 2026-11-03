import Link from 'next/link'
import React from 'react'

import { LivePreviewInIframe } from '@/components/LivePreviewListener/InIframe'
import { Media } from '@/components/Media'
import { leadPicture } from '@/lib/homepage/select'
import { formatLongDate } from '@/lib/format'
import { bylineText, mastheadDate } from '@/lib/voyager/arrange'
import { supportHref } from '@/lib/support-link'
import type { VoyagerData } from '@/lib/voyager/load'
import type { Contributor, Media as MediaDoc } from '@/payload-types'

type Story = NonNullable<VoyagerData['featured']>

const names = (s: Story): string[] => (s.contributors ?? []).map((c) => (typeof c === 'object' && c ? c.name : '')).filter(Boolean)
const sectionName = (s: Story): string => (s.section && typeof s.section === 'object' ? s.section.title : '')
const byline = (s: Story): string => {
  const who = bylineText(names(s))
  const when = s.publishedAt ? formatLongDate(s.publishedAt) : ''
  return [who && `By ${who}`, when].filter(Boolean).join(' · ')
}

/**
 * The Voyager's hub (board 13): the UWF student newspaper on the WUWF platform, in its own masthead. It keeps WUWF's footer-level
 * link back and a dark "Published with WUWF Public Media" bar; everything between is the students'.
 *
 * Not here: the board's "how it travels" panel (an explanation for WUWF staff on the design canvas, not reader content).
 */
export function VoyagerHub({ data, now = new Date() }: { data: VoyagerData; now?: Date }) {
  const { tagline, featured, latest, sections, videos, podcast, staff, join, footnote } = data
  const joinHref = supportHref(join.href)
  const featuredPicture = featured ? leadPicture<MediaDoc>(featured) : null

  return (
    <div className="bg-surface font-sans text-ink">
      <LivePreviewInIframe />
      <div className="bg-surface-dark text-surface">
        <div className="container flex min-h-11 flex-wrap items-center gap-x-5 gap-y-1 text-[0.8125rem]">
          <Link className="flex min-h-11 items-center text-surface hover:no-underline" href="/">Published with WUWF Public Media</Link>
          <span className="flex-1" />
          <Link className="flex min-h-11 items-center text-surface-dark-text" href="/">WUWF News</Link>
          <a className="flex min-h-11 items-center text-surface-dark-text" href="https://uwf.edu" rel="noopener">University of West Florida</a>
        </div>
      </div>

      <header className="border-b-[3px] border-double border-ink">
        <div className="container flex flex-col items-center gap-2 pb-0 pt-7 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-3">{mastheadDate(now)} · Pensacola, Florida</p>
          <h1 className="font-serif text-6xl font-black leading-[0.95] tracking-tight text-ink md:text-[5.75rem]">
            <Link className="text-ink hover:no-underline" href="/voyager">The Voyager</Link>
          </h1>
          {tagline && <p className="font-serif text-lg italic text-ink-2">{tagline}</p>}
          <nav aria-label="Voyager sections" className="mt-4 flex w-full flex-wrap justify-center gap-x-7 border-t border-ink py-1 text-sm font-bold uppercase tracking-wider">
            {sections.map(({ section }) => (
              <a className="inline-flex min-h-11 items-center text-ink" href={`#section-${section.slug ?? section.id}`} key={section.id}>{section.title}</a>
            ))}
            {(videos.length > 0 || podcast) && <a className="inline-flex min-h-11 items-center text-ink" href="#multimedia">Multimedia</a>}
            {staff.length > 0 && <a className="inline-flex min-h-11 items-center text-ink" href="#staff">Staff</a>}
          </nav>
        </div>
      </header>

      <main>
        {featured ? (
          <section className="container flex flex-wrap gap-8 py-8">
            <article className="flex min-w-0 flex-[999_1_38rem] flex-col gap-3">
              {featuredPicture && <Media imgClassName="aspect-video w-full object-cover" priority resource={featuredPicture} />}
              {sectionName(featured) && <p className="text-xs font-bold uppercase tracking-widest">{sectionName(featured)}</p>}
              <h2 className="font-serif text-4xl font-black leading-[1.04] tracking-tight md:text-5xl">
                {featured.path ? <Link className="text-ink" href={featured.path}>{featured.title}</Link> : featured.title}
              </h2>
              {featured.meta?.description && <p className="font-serif text-xl leading-normal text-ink-2">{featured.meta.description}</p>}
              <p className="text-sm text-ink-3">{byline(featured)}</p>
            </article>
            <aside aria-labelledby="latest-heading" className="flex min-w-0 flex-[1_1_20rem] flex-col border-l border-rule-strong pl-6">
              <h2 className="mb-1 text-xs font-bold uppercase tracking-widest" id="latest-heading">Latest</h2>
              {latest.length === 0 && <p className="py-3 text-ink-2">More stories soon.</p>}
              {latest.map((l) => (
                <Link className="flex min-h-11 flex-col gap-1 border-b border-rule py-3.5 text-ink hover:no-underline" href={l.path ?? '/voyager'} key={l.id}>
                  {sectionName(l) && <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-warning-fg">{sectionName(l)}</span>}
                  <span className="font-serif text-[1.1875rem] font-bold leading-snug">{l.title}</span>
                  <span className="text-[0.8125rem] text-ink-3">{bylineText(names(l))}</span>
                </Link>
              ))}
            </aside>
          </section>
        ) : (
          <section className="container py-12">
            <p className="rounded-sm border border-dashed border-rule-strong p-6 text-ink-2">The first stories are on their way.</p>
          </section>
        )}

        {sections.length > 0 && (
          <section aria-label="Sections" className="border-t border-ink">
            <div className="container grid gap-8 py-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
              {sections.map(({ section, stories }) => {
                const [lead, second] = stories
                const picture = lead ? leadPicture<MediaDoc>(lead) : null
                return (
                  <div className="flex flex-col gap-2.5" id={`section-${section.slug ?? section.id}`} key={section.id}>
                    <h2 className="border-b-[3px] border-warning-border pb-1.5 text-[0.8125rem] font-black uppercase tracking-[0.12em]">
                      {section.slug ? <Link className="text-ink hover:no-underline" href={`/${section.slug}`}>{section.title}</Link> : section.title}
                    </h2>
                    {lead ? (
                      <>
                        {picture && <Media imgClassName="aspect-[3/2] w-full object-cover" resource={picture} />}
                        <Link className="font-serif text-xl font-bold leading-tight text-ink" href={lead.path ?? '/voyager'}>{lead.title}</Link>
                        <span className="text-[0.8125rem] text-ink-3">{bylineText(names(lead))}</span>
                        {second && <Link className="border-t border-rule pt-2 text-[0.9375rem] font-semibold leading-snug text-ink-2" href={second.path ?? '/voyager'}>{second.title}</Link>}
                      </>
                    ) : (
                      <p className="text-ink-3">Nothing here yet.</p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {(videos.length > 0 || podcast) && (
          <section aria-label="Multimedia" className="bg-ink text-surface" id="multimedia">
            <div className="container flex flex-wrap items-stretch gap-6 py-10">
              <div className="flex min-w-0 flex-[1_1_16rem] flex-col justify-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-warning-border">Multimedia</p>
                <p className="font-serif text-3xl font-bold leading-tight">Voyager video and audio</p>
                <p className="text-[0.9375rem] text-surface-dark-text">Produced by students in WUWF&apos;s studios.</p>
              </div>
              {videos.map((v) => (
                <Link className="flex min-h-44 w-44 flex-none flex-col justify-end gap-1 rounded-md bg-surface-dark-hover p-3 text-surface hover:no-underline" href={v.path ?? '/voyager'} key={v.id}>
                  <span className="text-[0.6875rem] font-bold uppercase text-warning-border">Video</span>
                  <strong className="text-[0.9375rem] leading-snug">{v.title}</strong>
                </Link>
              ))}
              {podcast && (
                <Link className="flex min-w-0 flex-[1_1_16rem] items-center gap-3.5 rounded-md bg-surface-dark-hover p-4 text-surface hover:no-underline" href={podcast.path}>
                  <span aria-hidden="true" className="flex h-[4.5rem] w-[4.5rem] flex-none items-center justify-center rounded-sm bg-warning-border font-serif text-2xl font-black text-ink">{podcast.title.slice(0, 1)}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[0.6875rem] font-bold uppercase text-warning-border">Podcast</span>
                    <strong className="text-base leading-snug">{podcast.title}</strong>
                    {(podcast.summary ?? podcast.tagline) && <span className="text-[0.8125rem] text-surface-dark-text">{podcast.summary ?? podcast.tagline}</span>}
                  </span>
                </Link>
              )}
            </div>
          </section>
        )}

        {(staff.length > 0 || joinHref) && (
          <section aria-label="Staff" className="container flex flex-wrap gap-10 py-12" id="staff">
            {staff.length > 0 && (
              <div className="min-w-0 flex-[999_1_32rem]">
                <h2 className="mb-4 font-serif text-3xl font-black">Staff</h2>
                <ul className="m-0 grid list-none gap-5 p-0 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
                  {staff.map(({ person, role }) => (
                    <li key={person.id}>
                      <StaffCard person={person} role={role} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {joinHref && (
              <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-2.5 border-2 border-ink p-6 self-start">
                <strong className="font-serif text-2xl font-black">{join.heading}</strong>
                {join.text && <p className="text-[0.9375rem] text-ink-2">{join.text}</p>}
                <a className="inline-flex min-h-12 items-center justify-center bg-ink px-4 font-bold text-surface hover:no-underline" href={joinHref}>Join the newsroom</a>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t-[3px] border-double border-ink">
        <div className="container flex flex-wrap justify-between gap-4 py-7 text-sm text-ink-2">
          {footnote && <p className="max-w-[48rem]">{footnote}</p>}
          <p>
            <Link className="font-bold" href="/">WUWF Public Media</Link>
            {' · '}
            <a className="font-bold" href="https://uwf.edu" rel="noopener">University of West Florida</a>
          </p>
        </div>
      </footer>
    </div>
  )
}

function StaffCard({ person, role }: { person: Contributor; role: string }) {
  const photo = typeof person.photo === 'object' && person.photo ? person.photo : null
  const initials = person.initials || person.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const body = (
    <>
      {photo ? (
        <span className="h-14 w-14 flex-none overflow-hidden rounded-full bg-surface-3"><Media imgClassName="h-full w-full object-cover" resource={photo} /></span>
      ) : (
        <span aria-hidden="true" className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-surface-3 font-bold text-ink-2">{initials}</span>
      )}
      <span className="flex min-w-0 flex-col">
        <strong className="text-base">{person.name}</strong>
        {role && <span className="text-[0.8125rem] text-ink-3">{role}</span>}
      </span>
    </>
  )
  return person.slug ? (
    <Link className="flex min-h-14 items-center gap-3 text-ink hover:no-underline" href={`/people/${person.slug}`}>{body}</Link>
  ) : (
    <div className="flex min-h-14 items-center gap-3">{body}</div>
  )
}
