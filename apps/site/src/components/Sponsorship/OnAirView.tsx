import Link from 'next/link'
import React from 'react'

import { linkOf, shown, type SponsorshipContent } from '@/lib/sponsorship/content'
import { formatMoney } from '@/lib/sponsorship/money'
import { packageViews, perMonth } from '@/lib/sponsorship/packages'
import { INQUIRE_HREF } from '@/lib/sponsorship/paths'
import { rateCard } from '@/lib/sponsorship/rates'

import { RateEstimator } from './RateEstimator'
import { ContentHero, Paragraphs, Section, SponsorshipShell, buttonOnDark, buttonPrimary, card, eyebrow, headingProps, textLink } from './parts'

/** Board 17: On-air sponsorship. Rates, packages and every sentence are the admin's. */
export const OnAirView: React.FC<{ content: SponsorshipContent }> = ({ content }) => {
  const a = content.onAir
  const card_ = rateCard(a?.rates)
  const packages = packageViews(a?.packages)
  const heroLink = linkOf(a?.hero?.linkLabel, a?.hero?.linkHref)

  return (
    <SponsorshipShell content={content} current="onAir">
      <ContentHero
        aside={
          a?.hero?.quote ? (
            <figure className="m-0 flex flex-col gap-3 rounded-sm bg-surface p-6">
              <figcaption className={`${eyebrow} text-wuwf-blue-700`}>{a.hero.quoteLabel}</figcaption>
              <blockquote className="m-0 font-serif text-xl leading-snug">“{a.hero.quote}”</blockquote>
              {a.hero.quoteNote && <p className="text-sm text-ink-3">{a.hero.quoteNote}</p>}
            </figure>
          ) : undefined
        }
        hero={{ ...a?.hero, linkLabel: heroLink?.label, linkHref: heroLink?.href }}
      />

      {shown(a?.credit) && (
        <Section {...headingProps(a.credit)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={card}>
              <strong className="font-serif text-xl">{a.credit.includesTitle}</strong>
              <span className="text-base text-ink-2">{a.credit.includesText}</span>
            </div>
            <div className={card}>
              <strong className="font-serif text-xl">{a.credit.leavesTitle}</strong>
              <span className="text-base text-ink-2">{a.credit.leavesText}</span>
            </div>
          </div>
          {a.credit.linkLabel && a.hero?.linkHref && (
            <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={a.hero.linkHref}>
              {a.credit.linkLabel}
            </Link>
          )}
        </Section>
      )}

      {shown(a?.buy) && (
        <Section {...headingProps(a.buy)} tone="grey">
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {(a.buy.items ?? []).map((o) => (
              <li className="flex" key={o.id ?? o.title}>
                <a className="flex w-full flex-col gap-2 rounded-sm border border-rule-strong bg-surface p-5 text-ink no-underline hover:border-wuwf-blue-700 hover:no-underline" href={`#${o.anchor ?? 'rates'}`}>
                  <strong className="font-serif text-xl">{o.title}</strong>
                  <span className="text-base text-ink-2">{o.text}</span>
                  <strong className="mt-auto pt-2 text-wuwf-blue-700">{o.price}</strong>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {shown(a?.rates) && card_.rows.length > 0 && (
        <Section {...headingProps(a.rates)} id="rates">
          <RateEstimator
            card={card_}
            copy={{
              note: a.rates.note ?? '',
              eyebrow: a.rates.estimatorEyebrow ?? '',
              title: a.rates.estimatorTitle ?? '',
              disclaimer: a.rates.estimatorDisclaimer ?? '',
              cta: a.rates.estimatorCta ?? '',
              commitment: a.rates.commitmentLabel ?? '',
              credits: a.rates.creditsLabel ?? '',
            }}
          />
          {a.sharing?.title && (
            <div className="flex flex-col gap-1 rounded-sm bg-wuwf-lime-100 p-5">
              <strong className="font-serif text-xl">{a.sharing.title}</strong>
              <span className="text-base text-ink-2">{a.sharing.text}</span>
            </div>
          )}
        </Section>
      )}

      {shown(a?.carpool) && (
        <Section {...headingProps(a.carpool)} id="carpool" tone="grey">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-sm border border-rule-strong bg-surface p-5">
              <dd className="order-1 font-serif text-4xl font-bold">{formatMoney(Math.round((a.carpool.sixMonths ?? 0) * 100))}</dd>
              <dt className="order-2 text-sm font-normal text-ink-2">6 months · {perMonth(a.carpool.sixMonths, 6)} a month</dt>
            </div>
            <div className="flex flex-col gap-1 rounded-sm border border-rule-strong bg-surface p-5">
              <dd className="order-1 font-serif text-4xl font-bold">{formatMoney(Math.round((a.carpool.oneYear ?? 0) * 100))}</dd>
              <dt className="order-2 text-sm font-normal text-ink-2">
                1 year · {perMonth(a.carpool.oneYear, 12)} a month{a.carpool.perDayNote ? `, ${a.carpool.perDayNote}` : ''}
              </dt>
            </div>
          </dl>
          {a.carpool.slotsNote && <p className="text-base text-ink-2">{a.carpool.slotsNote}</p>}
          {a.carpool.ctaLabel && (
            <Link className={`${buttonPrimary} self-start`} href={INQUIRE_HREF}>
              {a.carpool.ctaLabel}
            </Link>
          )}
        </Section>
      )}

      {shown(a?.programs) && (
        <Section {...headingProps(a.programs)} id="programs">
          <div className="flex flex-col gap-2">
            {a.programs.chooseLabel && <strong className="text-sm">{a.programs.chooseLabel}</strong>}
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {(a.programs.names ?? []).map((n) => (
                <li className="rounded-full border border-rule-strong bg-surface px-4 py-2 text-base font-semibold" key={n.id ?? n.name}>
                  {n.name}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {shown(a?.packages) && packages.length > 0 && (
        <Section {...headingProps(a.packages)} id="packages" tone="grey">
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((p) => (
              <li className="flex" key={p.key}>
                <article className="flex w-full flex-col gap-2 rounded-sm border border-rule-strong bg-surface p-5">
                  <span className={`${eyebrow} text-ink-3`}>
                    {a.packages?.packageLabel} {p.number}
                  </span>
                  <h3 className="font-serif text-xl font-bold">{p.name}</h3>
                  <p className="text-base text-ink-2">{p.description}</p>
                  <strong className="mt-auto pt-3 font-serif text-4xl leading-none">{p.price}</strong>
                  {p.valueLine && <span className="text-sm text-ink-2">{p.valueLine}</span>}
                </article>
              </li>
            ))}
          </ul>
          {a.packages.note && <p className="text-sm text-ink-3">{a.packages.note}</p>}
        </Section>
      )}

      {shown(a?.pay) && (
        <section aria-label={a.pay.ctaTitle ?? 'Paying'} className="bg-wuwf-teal text-surface">
          <div className="container grid gap-8 py-12 md:py-14 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <ul className="m-0 flex list-none flex-col gap-3 p-0 text-base text-wuwf-blue-100">
              {(a.pay.items ?? []).map((i) => (
                <li key={i.id ?? i.heading}>
                  <strong className="text-surface">{i.heading}</strong> {i.text}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3">
              <strong className="font-serif text-3xl leading-tight">{a.pay.ctaTitle}</strong>
              <span className="text-base text-wuwf-blue-100">
                <Paragraphs text={a.pay.ctaText} />
              </span>
              {a.pay.ctaLabel && (
                <Link className={`${buttonOnDark} self-start`} href={INQUIRE_HREF}>
                  {a.pay.ctaLabel}
                </Link>
              )}
            </div>
          </div>
        </section>
      )}
    </SponsorshipShell>
  )
}
