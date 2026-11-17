import Link from 'next/link'
import React from 'react'

import { donateConfigOf, levelViews, type GivingContent, type LevelView } from '@/lib/giving/content'
import { buildDonateModel, donationHref } from '@/lib/giving/donate'
import { shown, textsOf } from '@/lib/page-content'
import { cn } from '@/utilities/ui'

import { ButtonLink, CheckList, eyebrow, Faq, headingProps, Hero, LinkCards, Paragraphs, Section, StepGrid, textLink } from '../PageParts'
import { DonateCard } from './DonateCard'
import { GivingShell, WithPhone } from './parts'

const levelFrame: Record<LevelView['emphasis'], string> = {
  standard: 'border border-rule-strong bg-surface',
  featured: 'border-2 border-wuwf-blue-700 bg-wuwf-blue-100',
  leadership: 'border border-wuwf-lime-600 bg-wuwf-lime-100',
}

/** The Give page (board 14): the gift card first, then what a gift does, why monthly, the levels, every other way to give, what happens after. */
export function GiveView({ content }: { content: GivingContent }) {
  const g = content.give
  const config = donateConfigOf(content)
  const frequencies = config ? buildDonateModel(config) : []
  const levels = levelViews(content.levels)
  const card = g?.card
  const levelsCard = g?.levels
  // The note under the button must not promise an amount "already chosen" unless the form really takes it from the link.
  const note = (content.donationForm?.prefill ? card?.noteWithPrefill : card?.noteWithoutPrefill)?.trim() || null
  // With no donation form address there is nowhere to send a gift, so the card says to call instead, with the number as a link.
  const unavailable = (
    <p className="rounded-sm bg-surface-2 p-4 text-[0.9375rem] text-ink-2">
      <WithPhone phone={content.phone} template={content.donationForm?.notSetUp?.trim() || 'To give today, call {phone}.'} />
    </p>
  )

  return (
    <GivingShell content={content} current="give">
      <div id="give">
        <Hero
          aside={frequencies.length ? <DonateCard frequencies={frequencies} note={note} unavailable={unavailable} /> : undefined}
          asideAlign="start"
          eyebrow={g?.hero?.eyebrow ?? ''}
          title={g?.hero?.title ?? ''}
          tone="dark"
        >
          <Paragraphs text={g?.hero?.body} />
          {(g?.hero?.assurances?.length ?? 0) > 0 && (
            <ul className="flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[0.9375rem] text-surface-dark-text">
              {textsOf(g?.hero?.assurances, 'text').map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </Hero>
      </div>

      {shown(g?.where) && (
        <Section {...headingProps(g.where)}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(g.where.items ?? []).map((item) => (
              <div className="flex flex-col gap-2.5 rounded-sm border border-rule-strong bg-surface p-6" key={item.id ?? item.heading}>
                <strong className="font-serif text-2xl leading-tight">{item.heading}</strong>
                <span className="text-base text-ink-2">{item.text}</span>
              </div>
            ))}
          </div>
          {(g.where.closingLead || g.where.closing) && (
            <p className="max-w-4xl text-[1.0625rem] text-ink-2">
              {g.where.closingLead && <strong>{g.where.closingLead} </strong>}
              {g.where.closing}
            </p>
          )}
        </Section>
      )}

      {shown(g?.monthly) && (
        <section aria-label={g.monthly.title ?? 'Why monthly'}>
          <div className="container flex flex-col gap-8 pb-12 md:pb-14 lg:flex-row lg:gap-10">
            <div className="flex flex-col gap-2.5 lg:flex-1">
              {g.monthly.eyebrow && <span className={`${eyebrow} text-wuwf-blue-700`}>{g.monthly.eyebrow}</span>}
              <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{g.monthly.title}</h2>
            </div>
            <div className="grid grid-cols-1 gap-7 sm:grid-cols-3 lg:flex-[2]">
              {(g.monthly.items ?? []).map((item) => (
                <div className="flex flex-col gap-2" key={item.id ?? item.heading}>
                  <strong className="text-lg">{item.heading}</strong>
                  <span className="text-base text-ink-2">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {shown(g?.levels) && levels.length > 0 && (
        <Section {...headingProps(g.levels)} id="levels">
          <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
            {levels.map((level) => {
              const href = donationHref(content.donationForm, { amount: level.minimumMonthly, frequency: 'monthly' })
              return (
                <li className={cn('flex flex-col gap-2.5 rounded-sm p-6', levelFrame[level.emphasis])} key={level.id}>
                  {level.amount && <span className={`${eyebrow} text-ink-3`}>{level.amount}</span>}
                  <strong className="font-serif text-2xl leading-tight">{level.name}</strong>
                  <CheckList items={level.benefits} />
                  {href && levelsCard?.buttonLabel && (
                    <a className={`${textLink} mt-auto inline-flex min-h-11 items-center pt-2 no-underline`} href={href} rel="noopener">
                      {levelsCard.buttonLabel}
                      <span className="sr-only"> ({level.name})</span>
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
          {g.levels.footnote && (
            <p className="text-sm text-ink-3">
              {g.levels.footnote}{' '}
              {g.levels.footnoteLinkLabel && g.levels.footnoteLinkHref && (
                <Link className={textLink} href={g.levels.footnoteLinkHref}>
                  {g.levels.footnoteLinkLabel}
                </Link>
              )}
            </p>
          )}
        </Section>
      )}

      {shown(g?.more) && (
        <Section {...headingProps(g.more)} tone="grey">
          <LinkCards items={g.more.items} />
        </Section>
      )}

      {shown(g?.after) && (
        <Section {...headingProps(g.after)}>
          <StepGrid steps={g.after.steps} />
          {g.after.linkLabel && g.after.linkHref && (
            <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={g.after.linkHref}>
              {g.after.linkLabel}
            </Link>
          )}
        </Section>
      )}

      {shown(g?.fellowships) && g.fellowships.title && (
        <section aria-label="Fund reporting" className="bg-wuwf-teal text-surface" id="fellowships">
          <div className="container flex flex-col gap-10 py-12 md:py-14 lg:flex-row">
            <div className="flex flex-col gap-3.5 lg:flex-1">
              {g.fellowships.eyebrow && <span className={`${eyebrow} text-wuwf-lime`}>{g.fellowships.eyebrow}</span>}
              <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{g.fellowships.title}</h2>
              {g.fellowships.body && <p className="text-lg text-wuwf-blue-100">{g.fellowships.body}</p>}
              <ButtonLink className="self-start" href={g.fellowships.buttonHref} label={g.fellowships.buttonLabel} variant="onDark" />
            </div>
            {(g.fellowships.commitments?.length ?? 0) > 0 && (
              <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:flex-1">
                {g.fellowships.commitments!.map((item) => (
                  <li className="rounded-sm bg-surface-dark/50 p-4" key={item.id ?? item.heading}>
                    <strong className="block">{item.heading}</strong>
                    <span className="text-sm text-wuwf-blue-100">{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {shown(g?.businesses) && g.businesses.title && (
        <section aria-label="For businesses" className="container pt-12 md:pt-14">
          <div className="flex flex-col gap-6 rounded-md border border-rule-strong p-7 md:flex-row md:items-center md:justify-between">
            <div className="flex max-w-3xl flex-col gap-1.5">
              <strong className="font-serif text-2xl leading-tight">{g.businesses.title}</strong>
              {g.businesses.text && <span className="text-base text-ink-2">{g.businesses.text}</span>}
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={g.businesses.buttonHref} label={g.businesses.buttonLabel} />
            </div>
          </div>
        </section>
      )}

      {shown(g?.faq) && (g.faq.items?.length ?? 0) > 0 && (
        <Section title={g.faq.title ?? 'Questions'}>
          <Faq items={g.faq.items} />
        </Section>
      )}
    </GivingShell>
  )
}
