import Link from 'next/link'
import React from 'react'

import { linkOf, phoneHref, shown, toStats, type SponsorshipContent } from '@/lib/sponsorship/content'
import { goalList } from '@/lib/sponsorship/goals'
import { INQUIRE_HREF, SPONSOR_PATHS } from '@/lib/sponsorship/paths'
import { summaryOf, type ProgramView } from '@/lib/sponsorship/programs'

import { Faq } from '../PageParts'
import { GoalPicker } from './GoalPicker'
import { InquiryForm } from './InquiryForm'
import { ContentHero, Paragraphs, Section, Source, SponsorshipShell, StatGrid, buttonOutline, buttonPrimary, card, eyebrow, headingProps, textLink } from './parts'


/** Board 16: Sponsor WUWF, the hub. Every sentence is the admin's. */
export const HubView: React.FC<{ content: SponsorshipContent; programs: ProgramView[]; interests: string[]; budgets: string[]; token: string }> = ({
  content,
  programs,
  interests,
  budgets,
  token,
}) => {
  const h = content.hub
  const goals = goalList(h?.goals, programs.map((p) => ({ name: p.name, summary: summaryOf(p.description) })))
  const tel = phoneHref(content.phone)
  const inquiry = h?.inquiry
  const hero = h?.hero

  return (
    <SponsorshipShell content={content} current="hub">
      <ContentHero
        actions={
          <>
            {hero?.primaryLabel && (
              <Link className={buttonPrimary} href={INQUIRE_HREF}>
                {hero.primaryLabel}
              </Link>
            )}
            {hero?.secondaryLabel && shown(h?.places) && (
              <a className={buttonOutline} href="#places">
                {hero.secondaryLabel}
              </a>
            )}
          </>
        }
        hero={hero}
      />
      {(h?.heroStats?.length ?? 0) > 0 && (
        <section aria-label="Key figures" className="container flex flex-col gap-3 py-8">
          <StatGrid stats={toStats(h?.heroStats)} />
          {h?.heroSource && <Source>{h.heroSource}</Source>}
        </section>
      )}

      {shown(h?.notAnAd) && (
        <Section {...headingProps({ ...h.notAnAd, body: null })} intro={<><Paragraphs text={h.notAnAd.body} />{linkOf(h.notAnAd.linkLabel, SPONSOR_PATHS.guidelines) && <Link className={textLink} href={SPONSOR_PATHS.guidelines}>{h.notAnAd.linkLabel}</Link>}</>}>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
            {(h.notAnAd.items ?? []).map((item) => (
              <li className={card} key={item.id ?? item.heading}>
                <strong className="font-serif text-xl">{item.heading}</strong>
                <span className="text-base text-ink-2">{item.text}</span>
              </li>
            ))}
          </ul>
          {h.notAnAd.source && <Source>{h.notAnAd.source}</Source>}
        </Section>
      )}

      {shown(h?.goals) && goals.length > 0 && (
        <Section {...headingProps(h.goals)} tone="grey">
          <GoalPicker copy={{ groupLabel: h.goals.title ?? '', looksLike: h.goals.looksLikeLabel ?? '', cta: h.goals.ctaLabel ?? '' }} goals={goals} />
        </Section>
      )}

      {shown(h?.places) && (
        <Section {...headingProps(h.places)} id="places">
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-3">
            {(h.places.items ?? []).map((p) => (
              <li className="flex" key={p.id ?? p.title}>
                <Link className="flex w-full flex-col gap-2 rounded-sm border border-rule-strong bg-surface p-6 text-ink no-underline hover:border-wuwf-blue-700 hover:no-underline" href={SPONSOR_PATHS[p.page ?? 'onAir']}>
                  <strong className="font-serif text-2xl">{p.title}</strong>
                  <span className="text-base text-ink-2">{p.body}</span>
                  <span className="text-sm text-ink-3">{p.detail}</span>
                  <strong className="mt-auto pt-3 text-wuwf-blue-700">{p.price}</strong>
                </Link>
              </li>
            ))}
          </ul>
          {h.places.noteTitle && (
            <div className="flex flex-col gap-1 rounded-sm bg-wuwf-lime-100 p-5">
              <strong className="font-serif text-xl">{h.places.noteTitle}</strong>
              <span className="text-base text-ink-2">{h.places.noteText}</span>
              {h.places.noteLinkLabel && (
                <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={`${SPONSOR_PATHS.onAir}#packages`}>
                  {h.places.noteLinkLabel}
                </Link>
              )}
            </div>
          )}
        </Section>
      )}

      {shown(h?.why) && (
        <Section {...headingProps({ ...h.why, body: null })} intro={<><Paragraphs text={h.why.body} />{h.why.linkLabel && <Link className={textLink} href={SPONSOR_PATHS.audience}>{h.why.linkLabel}</Link>}</>} tone="dark">
          <StatGrid columns={3} dark stats={toStats(h.why.stats)} />
          {h.why.source && <Source dark>{h.why.source}</Source>}
        </Section>
      )}

      {shown(h?.who) && (
        <Section {...headingProps(h.who)}>
          <StatGrid stats={toStats(h.who.stats)} />
          {h.who.source && <Source>{h.who.source}</Source>}
          {h.who.linkLabel && (
            <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={SPONSOR_PATHS.audience}>
              {h.who.linkLabel}
            </Link>
          )}
        </Section>
      )}

      {shown(h?.testimonials) && (
        <Section {...headingProps(h.testimonials)} tone="grey">
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
            {(h.testimonials.items ?? []).map((t) => (
              <li key={t.id ?? t.name}>
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
      )}

      {shown(h?.faq) && (
        <Section {...headingProps(h.faq)}>
          <Faq items={h.faq.items} />
        </Section>
      )}

      <section aria-label={inquiry?.title ?? 'Get a proposal'} className="bg-surface-2" id="inquire">
        <div className="container grid gap-10 py-12 md:py-14 lg:grid-cols-[1fr_1.6fr]">
          <div className="flex flex-col gap-3">
            {inquiry?.eyebrow && <span className={`${eyebrow} text-wuwf-blue-700`}>{inquiry.eyebrow}</span>}
            <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{inquiry?.title}</h2>
            <div className="flex flex-col gap-2 text-lg text-ink-2">
              <Paragraphs text={inquiry?.body} />
            </div>
            <p className="text-base text-ink-2">
              {inquiry?.contactTitle && <strong className="block">{inquiry.contactTitle}</strong>}
              {content.phone && (
                <>
                  {tel ? (
                    <a className={textLink} href={tel}>
                      {content.phone}
                    </a>
                  ) : (
                    content.phone
                  )}
                  <br />
                </>
              )}
              {content.address}
            </p>
          </div>
          <InquiryForm
            budgets={budgets}
            copy={{
              submit: inquiry?.submitLabel ?? '',
              sending: inquiry?.sendingLabel ?? '',
              thanksTitle: inquiry?.thanksTitle ?? '',
              thanksPrefix: inquiry?.thanksPrefix ?? '',
              notice: content.inquiryNotice ?? '',
              guidelinesNote: inquiry?.guidelinesNote ?? '',
              guidelinesLink: inquiry?.guidelinesLink ?? '',
              labels: {
                name: inquiry?.labels?.name ?? '',
                organization: inquiry?.labels?.organization ?? '',
                email: inquiry?.labels?.email ?? '',
                phone: inquiry?.labels?.phone ?? '',
                interests: inquiry?.labels?.interests ?? '',
                budget: inquiry?.labels?.budget ?? '',
                message: inquiry?.labels?.message ?? '',
                required: inquiry?.labels?.required ?? '',
              },
            }}
            initialToken={token}
            interests={interests}
            phone={content.phone ?? ''}
          />
        </div>
      </section>
    </SponsorshipShell>
  )
}
