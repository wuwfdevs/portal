import React from 'react'

import {
  ACTION_CAVEAT,
  HALO,
  HALO_COMPARISON,
  HALO_PERSONAL_IMPORTANCE,
  HALO_SOURCE,
  NATIONAL_NEWS,
  NATIONAL_NEWS_SOURCE,
  NATIONAL_PUBLIC_RADIO,
  NATIONAL_SOURCE,
  NIELSEN_SOURCE,
  SECTORS,
  SECTOR_SOURCE,
  SKEPTICAL_NOTE,
  SKEPTICAL_OF_ADVERTISING,
  SMALL_MARKETS_PROFILE,
  SMALL_MARKETS_SOURCE,
  WEEKLY_LISTENERS,
  WUWF_AUDIENCE,
} from '@/lib/sponsorship/audience'

import { SectorPicker } from './SectorPicker'
import { Hero, ProposalBand, Section, Source, SponsorshipShell, StatGrid } from './parts'

/** NPR listeners against people who use commercial news brands: two bars per statement, with the numbers written out beside them. */
const Comparison: React.FC = () => (
  <div className="flex flex-col gap-3">
    <strong className="text-sm">NPR listeners compared with people who use commercial news brands</strong>
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {HALO_COMPARISON.map((c) => (
        <li className="flex flex-col gap-1.5" key={c.label}>
          <span className="text-base text-ink-2">{c.label}</span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className="h-3.5 rounded-[2px] bg-wuwf-lime-600" style={{ width: `${c.npr}%` }} />
              <span className="text-sm font-bold">{c.npr}% · NPR listeners</span>
            </div>
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className="h-3.5 rounded-[2px] bg-ink-4" style={{ width: `${c.commercial}%` }} />
              <span className="text-sm text-ink-2">{c.commercial}% · commercial news</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  </div>
)

/** Board 20: Audience. Evidence in order of closeness to WUWF; every figure carries its source and base. */
export const AudienceView: React.FC = () => (
  <SponsorshipShell current="audience">
    <Hero eyebrow="Audience" title="Know who’s listening">
      <p>
        Start with who listens to WUWF. Then see what NPR’s research shows about listeners in smaller markets, how listeners respond to the businesses that support public radio, and how that looks for your kind of business.
      </p>
    </Hero>

    <Section eyebrow="WUWF’s audience" label="WUWF’s audience" title={`About ${WEEKLY_LISTENERS} people listen to WUWF in a typical week.`}>
      <StatGrid columns={3} stats={WUWF_AUDIENCE} />
      <Source>{NIELSEN_SOURCE}</Source>
    </Section>

    <Section
      eyebrow="Closest to home"
      intro={<p>NPR’s Small Markets Profile covers listeners in counties with fewer than 85,000 households. It is the closest NPR research to a station like WUWF. Comparisons are with all adults in those counties.</p>}
      label="NPR News listeners in smaller counties"
      title="NPR News listeners in smaller U.S. counties"
      tone="grey"
    >
      <StatGrid stats={SMALL_MARKETS_PROFILE} />
      <div className="flex flex-col gap-3">
        <h3 className="font-serif text-2xl font-bold">They are skeptical of advertising and loyal to what they trust.</h3>
        <StatGrid columns={4} stats={SKEPTICAL_OF_ADVERTISING} />
      </div>
      <Source>
        {SMALL_MARKETS_SOURCE} {SKEPTICAL_NOTE} Online and national figures follow.
      </Source>
    </Section>

    <Section
      eyebrow="The halo effect"
      intro={<p>{HALO_PERSONAL_IMPORTANCE} of NPR listeners say public radio is personally important to them. That goodwill carries over to the businesses that support it.</p>}
      label="The halo effect"
      title="Listeners think better of the businesses that support public radio."
    >
      <StatGrid columns={3} stats={HALO} />
      <Comparison />
      <Source>{ACTION_CAVEAT}</Source>
      <Source>{HALO_SOURCE}</Source>
    </Section>

    <Section
      eyebrow="Public radio listeners nationally, compared with the average U.S. adult"
      label="National figures"
      title="They’re involved, educated and influential."
      tone="grey"
    >
      <StatGrid columns={4} stats={NATIONAL_PUBLIC_RADIO.map((n) => ({ value: n.value, text: `${n.heading}: ${n.text}` }))} />
      <Source>{NATIONAL_SOURCE}</Source>
      <h3 className="font-serif text-2xl font-bold">NPR News listeners at a glance</h3>
      <StatGrid columns={3} stats={NATIONAL_NEWS} />
      <Source>{NATIONAL_NEWS_SOURCE}</Source>
    </Section>

    <Section eyebrow="By sector" label="By sector" title="How this looks for your kind of business">
      <SectorPicker sectors={SECTORS} />
      <Source>{SECTOR_SOURCE}</Source>
    </Section>

    <ProposalBand text="Corporate support can walk you through the research and the schedule that fits your business." title="Are these your customers?" />
  </SponsorshipShell>
)
