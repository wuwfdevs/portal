import Link from 'next/link'
import React from 'react'

import { INQUIRE_HREF, SHOW_UP_SOURCE, SHOW_UP_STATS, SPONSOR_PATHS } from '@/lib/sponsorship/content'
import type { ProgramView } from '@/lib/sponsorship/programs'

import { Hero, ProposalBand, Section, Source, SponsorshipShell, StatGrid, buttonPrimary, card, textLink } from './parts'

/** Board 19: Events and programs sponsorship. Each card is one open record from the Sponsorship global. */
export const EventsView: React.FC<{ programs: ProgramView[] }> = ({ programs }) => (
  <SponsorshipShell current="events">
    <Hero eyebrow="Events and programs" title="Put your name where WUWF’s community gathers.">
      <p>
        WUWF produces live music and a community book club. Sponsors become part of something people attend, join and talk about, and are thanked for it by name. Each one has its own partnership levels, set with you by corporate support. Recognition follows the{' '}
        <Link className={textLink} href={SPONSOR_PATHS.guidelines}>
          credit guidelines
        </Link>
        .
      </p>
    </Hero>

    <section aria-label="Why events fit this audience" className="container flex flex-col gap-4 py-10">
      <strong className="font-serif text-2xl leading-tight md:text-3xl">WUWF listeners are people who show up.</strong>
      <StatGrid stats={SHOW_UP_STATS} />
      <Source>
        {SHOW_UP_SOURCE}{' '}
        <Link className={textLink} href={SPONSOR_PATHS.audience}>
          More on the audience
        </Link>
        .
      </Source>
    </section>

    <Section eyebrow="Open to sponsors" label="Open to sponsors" title={programs.length === 1 ? 'One place to start' : programs.length === 2 ? 'Two places to start' : 'Places to start'}>
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
                    <strong className="text-sm">Ways to partner</strong>
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
                    <strong>Recognition.</strong> {p.recognition}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                  <Link className={buttonPrimary} href={INQUIRE_HREF}>
                    Talk to us about {p.name}
                  </Link>
                  {p.pageUrl && (
                    <Link className={`${textLink} inline-flex min-h-11 items-center`} href={p.pageUrl}>
                      More about {p.name}
                    </Link>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-3xl rounded-sm border border-rule-strong bg-surface-2 p-5 text-base text-ink-2">
          No event or program is open to new sponsors right now. Tell corporate support what you’d like to back and we’ll see what fits.
        </p>
      )}
    </Section>

    <Section eyebrow="Every partnership" label="What every partnership includes" title="What every partnership includes" tone="grey">
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
        {[
          { heading: 'A level that fits', text: 'Support the whole series or program, or a single performance or session.' },
          { heading: 'Recognition people will see', text: 'Where your name appears, spelled out before you commit.' },
          { heading: 'Terms you can plan around', text: 'Dates and length, agreed up front. Ask about category exclusivity.' },
        ].map((item) => (
          <li className={`${card} bg-surface p-6`} key={item.heading}>
            <strong className="font-serif text-[1.375rem] leading-tight">{item.heading}</strong>
            <span className="text-base text-ink-2">{item.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-3">Want more reach? Add on-air credits or digital placements around your partnership. Corporate support will build the schedule with you.</p>
    </Section>

    <ProposalBand text="Tell us what you’d like to support, and we’ll see what fits." title="Have an event or program in mind?" />
  </SponsorshipShell>
)
