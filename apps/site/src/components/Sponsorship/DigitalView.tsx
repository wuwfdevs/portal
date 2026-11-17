import Link from 'next/link'
import React from 'react'

import { SPONSOR_PATHS } from '@/lib/sponsorship/content'
import {
  APP_PLACEMENTS,
  DIGITAL_PACKAGE_CENTS,
  DIGITAL_RULES,
  DIGITAL_SEPARATE_CENTS,
  NEWSLETTER_AND_AUDIO_PLACEMENTS,
  WEBSITE_PLACEMENTS,
  type Placement,
} from '@/lib/sponsorship/digital'
import { formatMoney } from '@/lib/sponsorship/money'

import { Hero, ProposalBand, Section, SponsorshipShell, card, textLink } from './parts'

/** A placement table: name and what it is, its size when one is confirmed, and its rate. A row without a size just says nothing for it. */
const PlacementTable: React.FC<{ caption: string; rows: readonly Placement[] }> = ({ caption, rows }) => {
  const showSize = rows.some((r) => r.size)
  return (
    <div className="overflow-x-auto rounded-sm border border-rule-strong bg-surface">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[0.9375rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-surface-2 text-sm">
            <th className="px-4 py-3 font-bold" scope="col">
              Placement
            </th>
            {showSize && (
              <th className="px-4 py-3 font-bold" scope="col">
                Size
              </th>
            )}
            <th className="px-4 py-3 text-right font-bold" scope="col">
              Rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th className="border-t border-rule px-4 py-3 align-top font-normal" scope="row">
                <strong className="block">{r.name}</strong>
                <span className="text-sm text-ink-2">{r.detail}</span>
              </th>
              {showSize && <td className="border-t border-rule px-4 py-3 align-top text-ink-2">{r.size}</td>}
              <td className="border-t border-rule px-4 py-3 text-right align-top font-bold">{r.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A drawing of where a placement sits, not a final layout. Hidden from assistive tech: the table beside it says everything it does. */
const Mock: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <figure aria-hidden="true" className={`m-0 flex flex-col gap-2 rounded-sm border border-dashed border-ink-4 bg-surface-2 p-4 ${className ?? ''}`}>
    <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{label}</span>
    {children}
  </figure>
)

const Sponsor: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col gap-0.5 rounded-sm border border-rule-strong bg-surface p-3 text-sm">
    <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">Sponsor message</span>
    {children}
  </div>
)

/** Board 18: Digital sponsorship. */
export const DigitalView: React.FC = () => (
  <SponsorshipShell current="digital">
    <Hero eyebrow="Digital" title="Support WUWF where listeners read, tap and open.">
      <p>
        Sponsor messages on wuwf.org, in the WUWF app and in the e-newsletter, always labeled and sold directly by corporate support. Listeners who find advertising annoying and intrusive see no autoplay, no pop-ups and no third-party tracking on wuwf.org. Sponsor messages follow the same{' '}
        <Link className={textLink} href={SPONSOR_PATHS.guidelines}>
          credit guidelines
        </Link>{' '}
        as on-air credits.
      </p>
    </Hero>

    <Section
      eyebrow="Website"
      intro={<p>Your message sits in a fixed place on wuwf.org, on desktop and on mobile, clearly labeled as a sponsor message.</p>}
      label="Website placements"
      title="On the page where they read"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <Mock label="Illustration · display ad">
          <Sponsor>
            <strong>Example Credit Union</strong>
            <span>A member-owned credit union serving Northwest Florida.</span>
            <span className="text-wuwf-blue-700">example.org</span>
          </Sponsor>
        </Mock>
        <PlacementTable caption="Website placements and rates" rows={WEBSITE_PLACEMENTS} />
      </div>
    </Section>

    <Section
      eyebrow="App"
      intro={<p>People open the WUWF app to play the live stream. A banner keeps your name on the screen while they listen, and a pre-roll puts it in front of them before the stream starts.</p>}
      label="App placements"
      title="In their pocket, where they listen"
      tone="grey"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div className="grid gap-4 sm:grid-cols-2">
          <Mock label="Illustration · banner">
            <Sponsor>
              <strong>Example Credit Union</strong>
            </Sponsor>
          </Mock>
          <Mock label="Illustration · pre-roll, 0:10">
            <Sponsor>
              <strong>Example Credit Union</strong>
              <span>Then WUWF 88.1 live</span>
            </Sponsor>
          </Mock>
        </div>
        <PlacementTable caption="App placements and rates" rows={APP_PLACEMENTS} />
      </div>
      <p className="text-sm text-ink-3">Illustrations show placement, not final layouts.</p>
    </Section>

    <Section
      eyebrow="E-newsletter and audio"
      intro={<p>The WUWF e-newsletter goes to the station’s members, people who have chosen to support public radio with their own money. Your name sits beside theirs as a supporter. Audio placements put your message before the live stream in the apps, or inside a podcast.</p>}
      label="E-newsletter and audio placements"
      title="In the inbox of people who already support WUWF"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <Mock label="Illustration · e-newsletter">
          <Sponsor>
            <strong>A message from Example Credit Union</strong>
            <span>A credit union serving Northwest Florida.</span>
          </Sponsor>
        </Mock>
        <PlacementTable caption="E-newsletter and audio placements and rates" rows={NEWSLETTER_AND_AUDIO_PLACEMENTS} />
      </div>
    </Section>

    <section aria-label="The digital package" className="bg-wuwf-lime-100">
      <div className="container flex flex-col gap-4 py-12 md:flex-row md:items-center md:justify-between md:py-14">
        <div className="flex max-w-2xl flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-2">The digital package</span>
          <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">Start with all three for {formatMoney(DIGITAL_PACKAGE_CENTS)} a month.</h2>
          <p className="text-lg text-ink-2">
            A single banner in the app, a display ad on the website and a message in one e-newsletter issue. Bought separately, they cost {formatMoney(DIGITAL_SEPARATE_CENTS)}.
          </p>
        </div>
        <strong className="font-serif text-5xl leading-none">{formatMoney(DIGITAL_PACKAGE_CENTS)} a month</strong>
      </div>
    </section>

    <Section
      eyebrow="On wuwf.org"
      intro={<p>Most NPR News listeners in smaller U.S. counties find advertising annoying (88%). They won’t find that here.</p>}
      label="How sponsor messages behave on the site"
      title="A clean setting for your name"
    >
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-4">
        {DIGITAL_RULES.map((rule) => (
          <li className={card} key={rule.heading}>
            <strong className="font-serif text-xl">{rule.heading}</strong>
            <span className="text-base text-ink-2">{rule.text}</span>
          </li>
        ))}
      </ul>
    </Section>

    <ProposalBand text="Corporate support will recommend the placements that fit, and leave out the ones that don’t." title="Tell us where your customers are." />
  </SponsorshipShell>
)
