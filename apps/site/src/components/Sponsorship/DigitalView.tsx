import React from 'react'

import { shown, type SponsorshipContent } from '@/lib/sponsorship/content'
import { formatMoney } from '@/lib/sponsorship/money'
import { toCents } from '@/lib/sponsorship/rates'

import { ContentHero, ProposalBand, Section, SponsorshipShell, card, headingProps } from './parts'

type Row = { id?: string | null; name?: string | null; detail?: string | null; size?: string | null; price?: string | null }

/** A placement table: name and what it is, its size when one is confirmed, and its rate. */
const PlacementTable: React.FC<{ caption: string; rows: readonly Row[] | null | undefined }> = ({ caption, rows }) => {
  const list = (rows ?? []).filter((r) => r.name?.trim())
  if (list.length === 0) return null
  const showSize = list.some((r) => r.size?.trim())
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
          {list.map((r) => (
            <tr key={r.id ?? r.name}>
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
const Mock: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <figure aria-hidden="true" className="m-0 flex flex-col gap-2 rounded-sm border border-dashed border-ink-4 bg-surface-2 p-4">
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
export const DigitalView: React.FC<{ content: SponsorshipContent }> = ({ content }) => {
  const d = content.digital
  const ex = content.example
  return (
    <SponsorshipShell content={content} current="digital">
      <ContentHero hero={d?.hero} />

      {shown(d?.website) && (
        <Section {...headingProps(d.website)}>
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
            <Mock label="Illustration · display ad">
              <Sponsor>
                <strong>{ex?.name}</strong>
                <span>{ex?.line}</span>
                <span className="text-wuwf-blue-700">{ex?.website}</span>
              </Sponsor>
            </Mock>
            <PlacementTable caption={d.website.title ?? 'Website placements'} rows={d.website.placements} />
          </div>
        </Section>
      )}

      {shown(d?.app) && (
        <Section {...headingProps(d.app)} tone="grey">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
            <div className="grid gap-4 sm:grid-cols-2">
              <Mock label="Illustration · banner">
                <Sponsor>
                  <strong>{ex?.name}</strong>
                </Sponsor>
              </Mock>
              <Mock label="Illustration · pre-roll, 0:10">
                <Sponsor>
                  <strong>{ex?.name}</strong>
                </Sponsor>
              </Mock>
            </div>
            <PlacementTable caption={d.app.title ?? 'App placements'} rows={d.app.placements} />
          </div>
          {d.app.illustrationNote && <p className="text-sm text-ink-3">{d.app.illustrationNote}</p>}
        </Section>
      )}

      {shown(d?.newsletter) && (
        <Section {...headingProps(d.newsletter)}>
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
            <Mock label="Illustration · e-newsletter">
              <Sponsor>
                <strong>{ex?.name}</strong>
                <span>{ex?.line}</span>
              </Sponsor>
            </Mock>
            <PlacementTable caption={d.newsletter.title ?? 'E-newsletter and audio placements'} rows={d.newsletter.placements} />
          </div>
        </Section>
      )}

      {shown(d?.package) && (
        <section aria-label={d.package.title ?? 'The digital package'} className="bg-wuwf-lime-100">
          <div className="container flex flex-col gap-4 py-12 md:flex-row md:items-center md:justify-between md:py-14">
            <div className="flex max-w-2xl flex-col gap-2">
              {d.package.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-2">{d.package.eyebrow}</span>}
              <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{d.package.title}</h2>
              <p className="text-lg text-ink-2">{d.package.body}</p>
            </div>
            {typeof d.package.price === 'number' && (
              <strong className="font-serif text-5xl leading-none">
                {formatMoney(toCents(d.package.price))} {d.package.priceSuffix}
              </strong>
            )}
          </div>
        </section>
      )}

      {shown(d?.rules) && (
        <Section {...headingProps(d.rules)}>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-4">
            {(d.rules.items ?? []).map((rule) => (
              <li className={card} key={rule.id ?? rule.heading}>
                <strong className="font-serif text-xl">{rule.heading}</strong>
                <span className="text-base text-ink-2">{rule.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ProposalBand closing={d?.closing} />
    </SponsorshipShell>
  )
}
