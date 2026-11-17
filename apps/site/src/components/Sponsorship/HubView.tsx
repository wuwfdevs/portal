import Link from 'next/link'
import React from 'react'

import {
  FAQ,
  HERO_SOURCE,
  HERO_STATS,
  INQUIRE_HREF,
  NOT_AN_AD,
  NOT_AN_AD_SOURCE,
  SPONSOR_PATHS,
  TESTIMONIALS,
  WHO_LISTENS,
  WHO_LISTENS_SOURCE,
  WHY_IT_WORKS,
  WHY_IT_WORKS_SOURCE,
} from '@/lib/sponsorship/content'
import { NEWSLETTER_ISSUE_CENTS } from '@/lib/sponsorship/digital'
import { GOALS, eventsGoal } from '@/lib/sponsorship/goals'
import { formatMoney } from '@/lib/sponsorship/money'
import { NEW_SPONSOR_PACKAGES } from '@/lib/sponsorship/packages'
import { DAYPARTS } from '@/lib/sponsorship/rates'
import { summaryOf, type ProgramView } from '@/lib/sponsorship/programs'

import { GoalPicker } from './GoalPicker'
import { InquiryForm } from './InquiryForm'
import { Hero, Section, Source, StatGrid, SponsorshipShell, buttonOutline, buttonPrimary, card, eyebrow, textLink } from './parts'

/** "A", "A and B", "A, B and C". */
const listOf = (names: string[]): string => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

const lowestCredit = Math.min(...DAYPARTS.flatMap((d) => d.cents))
const lowestPackage = Math.min(...NEW_SPONSOR_PACKAGES.map((p) => p.priceCents))

/** Board 16: Sponsor WUWF, the hub. */
export const HubView: React.FC<{ programs: ProgramView[]; inquiryNotice: string; token: string }> = ({ programs, inquiryNotice, token }) => {
  const goals = [...GOALS]
  const events = eventsGoal(programs.map((p) => ({ name: p.name, summary: summaryOf(p.description) })))
  if (events) goals.push(events)

  return (
    <SponsorshipShell current="hub">
      <Hero
        actions={
          <>
            <Link className={buttonPrimary} href={INQUIRE_HREF}>
              Get a proposal
            </Link>
            <a className={buttonOutline} href="#places">
              See where your name can appear
            </a>
          </>
        }
        eyebrow="Sponsor WUWF"
        title="Be the business that supports public radio."
      >
        <p>
          About 22,500 people listen to WUWF in a typical week. NPR’s research shows they think better of the businesses that support public radio and prefer to buy from them. Your name reaches them on the radio, online and at live events, as support rather than as an ad.
        </p>
      </Hero>
      <section aria-label="Key figures" className="container flex flex-col gap-3 py-8">
        <StatGrid stats={HERO_STATS} />
        <Source>{HERO_SOURCE}</Source>
      </section>

      <Section
        eyebrow="Why public radio sponsorship is different"
        intro={
          <p>
            Most people have learned to tune out advertising. Among NPR News listeners in smaller U.S. counties, 88% say much of advertising is far too annoying and 86% say it is more manipulative than informative. A WUWF sponsor credit is built differently. It names your business, thanks you for supporting the station and says where to learn more.{' '}
            <Link className={textLink} href={SPONSOR_PATHS.guidelines}>
              What a credit can and can’t say →
            </Link>
          </p>
        }
        label="How sponsorship differs from advertising"
        title="Your name arrives as support, not as an interruption."
      >
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
          {NOT_AN_AD.map((item) => (
            <li className={card} key={item.heading}>
              <strong className="font-serif text-xl">{item.heading}</strong>
              <span className="text-base text-ink-2">{item.text}</span>
            </li>
          ))}
        </ul>
        <Source>{NOT_AN_AD_SOURCE}</Source>
      </Section>

      <Section
        eyebrow="Start with your goal"
        intro={<p>Pick the closest match to see what it could look like and what it would cost. Corporate support tailors every schedule to your business.</p>}
        label="Start with your goal"
        title="What do you want your sponsorship to do?"
        tone="grey"
      >
        <GoalPicker goals={goals} />
      </Section>

      <Section
        eyebrow="Where you can appear"
        id="places"
        intro={<p>Start in one place. Add another when you’re ready.</p>}
        label="Where you can appear"
        title="Three places your name can appear"
      >
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-3">
          <li className="flex">
            <PlaceCard
              body="Your name inside the news and music programs your customers already choose."
              detail="Pay by the credit, or choose a weekly Carpool message, a whole program or a ready-made package."
              href={SPONSOR_PATHS.onAir}
              price={`From ${formatMoney(lowestCredit)} a credit →`}
              title="On air"
            />
          </li>
          <li className="flex">
            <PlaceCard
              body="Your name on the website, in the app and in the e-newsletter, where listeners read, tap and open."
              detail="Pay by the month, or by the issue."
              href={SPONSOR_PATHS.digital}
              price={`From ${formatMoney(NEWSLETTER_ISSUE_CENTS)} an issue →`}
              title="Digital"
            />
          </li>
          <li className="flex">
            <PlaceCard
              body={`Your name where WUWF’s community gathers${programs.length > 0 ? `: ${listOf(programs.map((p) => p.name))}` : ''}.`}
              detail="Each has its own partnership levels."
              href={SPONSOR_PATHS.events}
              price="Priced on request →"
              title="Events and programs"
            />
          </li>
        </ul>
        <div className="flex flex-col gap-1 rounded-sm bg-wuwf-lime-100 p-5">
          <strong className="font-serif text-xl">New to WUWF? Your first schedule costs less.</strong>
          <span className="text-base text-ink-2">
            Four ready-made on-air packages give first-time sponsors 25% off drive-time credits. They start at {formatMoney(lowestPackage)}.
          </span>
          <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={`${SPONSOR_PATHS.onAir}#packages`}>
            See the new-sponsor packages →
          </Link>
        </div>
      </Section>

      <Section
        eyebrow="Why it works"
        intro={
          <p>
            NPR calls it the halo effect: the goodwill listeners feel for public radio carries over to the businesses that support it. 82% of NPR listeners say public radio is personally important to them. The comparison group, people who use commercial news brands, feels very differently about the ads on those brands.{' '}
            <Link className={textLink} href={SPONSOR_PATHS.audience}>
              See who’s listening →
            </Link>
          </p>
        }
        label="Why it works"
        title="Listeners think better of the businesses that support WUWF."
        tone="dark"
      >
        <StatGrid columns={3} dark stats={WHY_IT_WORKS.map((s) => ({ value: s.value, text: s.text, compare: s.compare }))} />
        <Source dark>{WHY_IT_WORKS_SOURCE}</Source>
      </Section>

      <Section eyebrow="The people behind the numbers" label="Who listens" title="Established, rooted and involved in their community">
        <StatGrid stats={WHO_LISTENS} />
        <Source>{WHO_LISTENS_SOURCE}</Source>
        <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={SPONSOR_PATHS.audience}>
          See the full audience profile →
        </Link>
      </Section>

      <Section eyebrow="What sponsors tell us" label="What sponsors tell us" title="Local sponsors, in their words" tone="grey">
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <li key={t.name}>
              <figure className="m-0 flex h-full flex-col gap-3 rounded-sm border border-rule-strong bg-surface p-5">
                <blockquote className="m-0 font-serif text-lg leading-snug text-ink">“{t.quote}”</blockquote>
                <figcaption className="mt-auto text-sm text-ink-2">
                  <strong className="block text-ink">{t.name}</strong>
                  {t.role}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Common questions" label="Common questions" title="Before you ask">
        <div className="flex max-w-3xl flex-col">
          {FAQ.map((f) => (
            <details className="group border-t border-rule last:border-b" key={f.question}>
              <summary className="flex min-h-14 cursor-pointer items-center py-2 font-serif text-xl font-bold">{f.question}</summary>
              <div className="flex flex-col gap-2 pb-4 text-base text-ink-2">
                <p>{f.answer}</p>
                {f.link && (
                  <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={f.link.href}>
                    {f.link.label}
                  </Link>
                )}
              </div>
            </details>
          ))}
        </div>
      </Section>

      <section aria-label="Get a proposal" className="bg-surface-2" id="inquire">
        <div className="container grid gap-10 py-12 md:py-14 lg:grid-cols-[1fr_1.6fr]">
          <div className="flex flex-col gap-3">
            <span className={`${eyebrow} text-wuwf-blue-700`}>Corporate support</span>
            <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">Get a proposal</h2>
            <p className="text-lg text-ink-2">
              Tell us what you want to happen and when. WUWF’s corporate support team will come back with a proposal: a schedule and rates built around your goal.
            </p>
            <p className="text-base text-ink-2">
              <strong className="block">WUWF Corporate Support</strong>
              Prefer to talk? Call{' '}
              <a className={textLink} href="tel:+18504737453">
                850 473-7453
              </a>
              .<br />
              11000 University Parkway, Building 88, Pensacola, FL 32514
            </p>
          </div>
          <InquiryForm initialToken={token} notice={inquiryNotice} />
        </div>
      </section>
    </SponsorshipShell>
  )
}

const PlaceCard: React.FC<{ title: string; body: string; detail: string; price: string; href: string }> = ({ title, body, detail, price, href }) => (
  <Link className="flex w-full flex-col gap-2 rounded-sm border border-rule-strong bg-surface p-6 text-ink no-underline hover:border-wuwf-blue-700 hover:no-underline" href={href}>
    <strong className="font-serif text-2xl">{title}</strong>
    <span className="text-base text-ink-2">{body}</span>
    <span className="text-sm text-ink-3">{detail}</span>
    <strong className="mt-auto pt-3 text-wuwf-blue-700">{price}</strong>
  </Link>
)
