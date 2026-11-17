import Link from 'next/link'
import React from 'react'

import { CREDIT_INCLUDES, CREDIT_LEAVES_OUT, EXAMPLE_CREDIT, INQUIRE_HREF, SPONSOR_PATHS } from '@/lib/sponsorship/content'
import { formatMoney } from '@/lib/sponsorship/money'
import { CARPOOL, DRIVE_TIME_OPEN_CENTS, NEW_SPONSOR_DRIVE_CENTS, NEW_SPONSOR_PACKAGES, SPONSORABLE_PROGRAMS, carpoolPerMonth, packagePrice, packageValueLine } from '@/lib/sponsorship/packages'
import { DAYPARTS, NONPROFIT_PERCENT, PREPAY_PERCENT } from '@/lib/sponsorship/rates'

import { RateEstimator } from './RateEstimator'
import { Hero, Section, SponsorshipShell, buttonOnDark, buttonPrimary, card, eyebrow, textLink } from './parts'

const lowestCredit = Math.min(...DAYPARTS.flatMap((d) => d.cents))
const lowestPackage = Math.min(...NEW_SPONSOR_PACKAGES.map((p) => p.priceCents))

/** Board 17: On-air sponsorship. */
export const OnAirView: React.FC = () => (
  <SponsorshipShell current="onAir">
    <Hero
      aside={
        <figure className="m-0 flex flex-col gap-3 rounded-sm bg-surface p-6">
          <figcaption className={`${eyebrow} text-wuwf-blue-700`}>What your credit sounds like</figcaption>
          <blockquote className="m-0 font-serif text-xl leading-snug">{EXAMPLE_CREDIT}</blockquote>
          <p className="text-sm text-ink-3">
            An illustration. Example Credit Union is not a real sponsor. Credits name you, say what you do and where to learn more. They leave out prices, claims and calls to buy.{' '}
            <Link className={textLink} href={SPONSOR_PATHS.guidelines}>
              See the credit guidelines.
            </Link>
          </p>
        </figure>
      }
      eyebrow="On air"
      title="Your name, inside the programs your customers choose."
    >
      <p>
        A WUWF credit names your business and thanks you for supporting public radio. It isn’t an ad, and that is why listeners trust it: 66% of NPR listeners find the businesses they hear on public radio more credible than ads elsewhere. Choose the hours that match your customers’ day, and corporate support handles the schedule.
      </p>
    </Hero>

    <Section eyebrow="Writing your credit" label="What a credit says" title="Who you are, what you do, where to learn more.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className={card}>
          <strong className="font-serif text-xl">A credit includes</strong>
          <span className="text-base text-ink-2">{CREDIT_INCLUDES}</span>
        </div>
        <div className={card}>
          <strong className="font-serif text-xl">A credit leaves out</strong>
          <span className="text-base text-ink-2">{CREDIT_LEAVES_OUT}</span>
        </div>
      </div>
      <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={SPONSOR_PATHS.guidelines}>
        Read the credit guidelines →
      </Link>
    </Section>

    <Section
      eyebrow="How to buy on air"
      intro={<p>All four put your name on the air. They differ in how much you plan yourself and how much we plan for you.</p>}
      label="How to buy on air"
      title="Choose how you want to buy"
      tone="grey"
    >
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: '#rates', title: 'By the credit', text: 'Pick your hours and how long you’ll commit. The longer you commit, the less each credit costs.', price: `From ${formatMoney(lowestCredit)} a credit →` },
          { href: '#carpool', title: 'The Carpool Plan', text: 'One short message every week, same day and time, in drive-time news.', price: `${formatMoney(CARPOOL.sixMonthsCents)} for 6 months →` },
          { href: '#programs', title: 'A whole program', text: 'Your name in one program, every time it airs, for 13 weeks.', price: 'Priced on request →' },
          { href: '#packages', title: 'A new-sponsor package', text: 'A ready-made schedule at a first-time discount.', price: `From ${formatMoney(lowestPackage)} →` },
        ].map((o) => (
          <li className="flex" key={o.href}>
            <a className="flex w-full flex-col gap-2 rounded-sm border border-rule-strong bg-surface p-5 text-ink no-underline hover:border-wuwf-blue-700 hover:no-underline" href={o.href}>
              <strong className="font-serif text-xl">{o.title}</strong>
              <span className="text-base text-ink-2">{o.text}</span>
              <strong className="mt-auto pt-2 text-wuwf-blue-700">{o.price}</strong>
            </a>
          </li>
        ))}
      </ul>
    </Section>

    <Section
      eyebrow="By the credit"
      id="rates"
      intro={
        <p>
          The longer you commit, the less each credit costs. Prepay and take another {PREPAY_PERCENT}% off. Nonprofits take {NONPROFIT_PERCENT}% off open rates.
        </p>
      }
      label="Rate card and estimate"
      title="Pick your hours. Pay per credit."
    >
      <RateEstimator />
      <div className="flex flex-col gap-1 rounded-sm bg-wuwf-lime-100 p-5">
        <strong className="font-serif text-xl">Backing a nonprofit? Ask about the Sharing Spirit.</strong>
        <span className="text-base text-ink-2">
          Your credit names your business, the charity you support and what the charity does. Listeners learn about the cause and see who stands behind it. It runs in any daypart at the rate card price.
        </span>
      </div>
    </Section>

    <Section
      eyebrow="The Carpool Plan"
      id="carpool"
      intro={
        <>
          <p>
            Your {CARPOOL.words}-word message airs once a week, on the day and time you choose, in a morning or afternoon drive-time slot inside NPR news. You share the break with one other business, which is the “carpool.”
          </p>
          <p>
            Because it returns at the same time every week, it becomes part of the listener’s routine. Public radio listeners stay loyal to the brands they trust: 91% of NPR News listeners in smaller counties say they stick with a brand once they like it. You can buy more than one, or add a Carpool Plan to any other schedule.
          </p>
        </>
      }
      label="The Carpool Plan"
      title="Be the name listeners hear every week."
      tone="grey"
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-sm border border-rule-strong bg-surface p-5">
          <dd className="order-1 font-serif text-4xl font-bold">{formatMoney(CARPOOL.sixMonthsCents)}</dd>
          <dt className="order-2 text-sm font-normal text-ink-2">6 months · {carpoolPerMonth(CARPOOL.sixMonthsCents, 6)} a month</dt>
        </div>
        <div className="flex flex-col gap-1 rounded-sm border border-rule-strong bg-surface p-5">
          <dd className="order-1 font-serif text-4xl font-bold">{formatMoney(CARPOOL.oneYearCents)}</dd>
          <dt className="order-2 text-sm font-normal text-ink-2">1 year · {carpoolPerMonth(CARPOOL.oneYearCents, 12)} a month, or about $4 a day</dt>
        </div>
      </dl>
      <p className="text-base text-ink-2">Slots are limited. Corporate support will offer the days and times that are open.</p>
      <Link className={`${buttonPrimary} self-start`} href={INQUIRE_HREF}>
        Ask about open slots
      </Link>
    </Section>

    <Section
      eyebrow="A whole program"
      id="programs"
      intro={
        <p>
          Your credit airs in the program you choose, every time it airs, for 13 weeks, so your name sits beside content listeners already seek out. It’s also part of the All Day Plan below. To sponsor a program on its own, ask corporate support for a rate.
        </p>
      }
      label="Sponsor a whole program"
      title="Make one program yours for a quarter."
    >
      <div className="flex flex-col gap-2">
        <strong className="text-sm">Choose from</strong>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {SPONSORABLE_PROGRAMS.map((name) => (
            <li className="rounded-full border border-rule-strong bg-surface px-4 py-2 text-base font-semibold" key={name}>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </Section>

    <Section
      eyebrow="New-sponsor packages"
      id="packages"
      intro={
        <p>
          Drive-time credits in NPR news normally cost {formatMoney(DRIVE_TIME_OPEN_CENTS)} each. First-time sponsors pay {formatMoney(NEW_SPONSOR_DRIVE_CENTS)} in these ready-made schedules.
        </p>
      }
      label="New-sponsor packages"
      title="New to WUWF? Start in the news hours at 25% off."
      tone="grey"
    >
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {NEW_SPONSOR_PACKAGES.map((p) => (
          <li className="flex" key={p.key}>
            <article className="flex w-full flex-col gap-2 rounded-sm border border-rule-strong bg-surface p-5">
              <span className={`${eyebrow} text-ink-3`}>Package {p.number}</span>
              <h3 className="font-serif text-xl font-bold">{p.name}</h3>
              <p className="text-base text-ink-2">{p.description}</p>
              <strong className="mt-auto pt-3 font-serif text-4xl leading-none">{packagePrice(p)}</strong>
              <span className="text-sm text-ink-2">{packageValueLine(p)}</span>
            </article>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-3">
        Packages can be invoiced monthly across the contract period. The prepayment discount doesn’t apply to packages, but prepaid schedules get additional bonus messages.
      </p>
    </Section>

    <section aria-label="Paying and next steps" className="bg-wuwf-teal text-surface">
      <div className="container grid gap-8 py-12 md:py-14 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <ul className="m-0 flex list-none flex-col gap-3 p-0 text-base text-wuwf-blue-100">
          <li>
            <strong className="text-surface">Paying.</strong> We accept Visa, MasterCard, Discover and American Express.
          </li>
          <li>
            <strong className="text-surface">Prepaying.</strong> Take {PREPAY_PERCENT}% off any rate-card schedule.
          </li>
          <li>
            <strong className="text-surface">Nonprofit?</strong> Take {NONPROFIT_PERCENT}% off open rates.
          </li>
        </ul>
        <div className="flex flex-col gap-3">
          <strong className="font-serif text-3xl leading-tight">Ready to pick your hours?</strong>
          <span className="text-base text-wuwf-blue-100">Tell us who you want to reach and when. Corporate support will send a schedule and rates, and draft your credit with you.</span>
          <Link className={`${buttonOnDark} self-start`} href={INQUIRE_HREF}>
            Get a proposal
          </Link>
        </div>
      </div>
    </section>
  </SponsorshipShell>
)
