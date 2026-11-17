import Link from 'next/link'
import React from 'react'

import { fill, shown, toStats, type SponsorshipContent } from '@/lib/sponsorship/content'
import { INQUIRE_HREF, SPONSOR_PATHS } from '@/lib/sponsorship/paths'
import type { ProgramView } from '@/lib/sponsorship/programs'

import { ContentHero, ProposalBand, Section, Source, SponsorshipShell, StatGrid, buttonPrimary, card, textLink } from './parts'

/** Board 19: Events and programs sponsorship. Each card is one open record from the Sponsorship global. */
export const EventsView: React.FC<{ content: SponsorshipContent; programs: ProgramView[] }> = ({ content, programs }) => {
  const e = content.events
  const open = e?.open
  const title = programs.length === 1 ? open?.titleOne : programs.length === 2 ? open?.titleTwo : open?.titleMany

  return (
    <SponsorshipShell content={content} current="events">
      <ContentHero hero={e?.hero} />

      {shown(e?.showUp) && (
        <section aria-label={e.showUp.title ?? ''} className="container flex flex-col gap-4 py-10">
          <strong className="font-serif text-2xl leading-tight md:text-3xl">{e.showUp.title}</strong>
          <StatGrid stats={toStats(e.showUp.stats)} />
          <Source>
            {e.showUp.source}{' '}
            {e.showUp.linkLabel && (
              <Link className={textLink} href={SPONSOR_PATHS.audience}>
                {e.showUp.linkLabel}
              </Link>
            )}
          </Source>
        </section>
      )}

      {open && (
        <Section eyebrow={open.eyebrow || undefined} title={title ?? ''}>
          {programs.length > 0 ? (
            <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 lg:grid-cols-2">
              {programs.map((p) => (
                <li className="flex" key={p.key}>
                  <article className="flex w-full flex-col gap-4 rounded-sm border border-rule-strong bg-surface p-6 md:p-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{p.kindLabel}</span>
                      <h3 className="font-serif text-3xl font-bold leading-tight">{p.name}</h3>
                    </div>
                    <p className="text-lg text-ink-2">{p.description}</p>
                    {p.levels.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {open.levelsLabel && <strong className="text-sm">{open.levelsLabel}</strong>}
                        <ul className="m-0 flex list-none flex-col p-0">
                          {p.levels.map((l) => (
                            <li className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-rule py-3" key={l.key}>
                              <div className="flex flex-col">
                                <strong>{l.name}</strong>
                                {l.description && <span className="text-sm text-ink-2">{l.description}</span>}
                              </div>
                              <strong className="text-[0.9375rem]">{l.price}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {p.recognition && (
                      <p className="text-sm text-ink-2">
                        {open.recognitionLabel && <strong>{open.recognitionLabel}</strong>} {p.recognition}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                      {open.talkLabel && (
                        <Link className={buttonPrimary} href={INQUIRE_HREF}>
                          {fill(open.talkLabel, { name: p.name })}
                        </Link>
                      )}
                      {p.pageUrl && open.moreLabel && (
                        <Link className={`${textLink} inline-flex min-h-11 items-center`} href={p.pageUrl}>
                          {fill(open.moreLabel, { name: p.name })}
                        </Link>
                      )}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            open.emptyText && <p className="max-w-3xl rounded-sm border border-rule-strong bg-surface-2 p-5 text-base text-ink-2">{open.emptyText}</p>
          )}
        </Section>
      )}

      {shown(e?.every) && (
        <Section eyebrow={e.every.eyebrow || undefined} title={e.every.title ?? ''} tone="grey">
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
            {(e.every.items ?? []).map((item) => (
              <li className={`${card} bg-surface p-6`} key={item.id ?? item.heading}>
                <strong className="font-serif text-[1.375rem] leading-tight">{item.heading}</strong>
                <span className="text-base text-ink-2">{item.text}</span>
              </li>
            ))}
          </ul>
          {e.every.note && <p className="text-sm text-ink-3">{e.every.note}</p>}
        </Section>
      )}

      <ProposalBand closing={e?.closing} />
    </SponsorshipShell>
  )
}
