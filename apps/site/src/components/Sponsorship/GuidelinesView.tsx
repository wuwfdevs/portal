import React from 'react'

import { shown, type SponsorshipContent } from '@/lib/sponsorship/content'

import { ContentHero, ProposalBand, Section, Source, SponsorshipShell, card, eyebrow, headingProps } from './parts'

/** Board 20b: Credit guidelines. What a credit can and can’t say, from NPR’s sponsor recognition guidelines. */
export const GuidelinesView: React.FC<{ content: SponsorshipContent }> = ({ content }) => {
  const g = content.guidelines
  const hasLists = shown(g?.includes) || shown(g?.leavesOut)

  return (
    <SponsorshipShell content={content} current="guidelines">
      <ContentHero hero={g?.hero} />

      {hasLists && (
        <div className="container grid gap-6 py-12 md:py-14 lg:grid-cols-2">
          {shown(g?.includes) && (
            <section aria-labelledby="includes" className="flex flex-col gap-3">
              {g.includes.eyebrow && <span className={`${eyebrow} text-wuwf-blue-700`}>{g.includes.eyebrow}</span>}
              <h2 className="font-serif text-3xl font-bold leading-tight" id="includes">
                {g.includes.title}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(g.includes.items ?? []).map((item) => (
                  <li className="flex gap-3 rounded-sm border border-rule-strong bg-surface p-3 text-base" key={item.id ?? item.text}>
                    <span aria-hidden="true" className="font-bold text-success-fg">
                      +
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {shown(g?.leavesOut) && (
            <section aria-labelledby="leaves-out" className="flex flex-col gap-3">
              {g.leavesOut.eyebrow && <span className={`${eyebrow} text-wuwf-blue-700`}>{g.leavesOut.eyebrow}</span>}
              <h2 className="font-serif text-3xl font-bold leading-tight" id="leaves-out">
                {g.leavesOut.title}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(g.leavesOut.items ?? []).map((item) => (
                  <li className="flex gap-3 rounded-sm border border-rule-strong bg-surface p-3 text-base" key={item.id ?? item.heading}>
                    <span aria-hidden="true" className="font-bold text-on-air-red">
                      −
                    </span>
                    <span>
                      <strong>{item.heading}</strong>
                      <span className="block text-sm text-ink-2">{item.examples}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {shown(g?.side) && (
        <Section {...headingProps(g.side)} tone="grey">
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {(g.side.pairs ?? []).map((pair) => (
              <li className="grid gap-4 md:grid-cols-2" key={pair.id ?? pair.credit}>
                <div className={`${card} bg-surface`}>
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{g.side?.adLabel}</span>
                  <p className="font-serif text-lg text-ink-2">{pair.ad}</p>
                </div>
                <div className={`${card} border-wuwf-blue-700 bg-wuwf-blue-100`}>
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-wuwf-blue-700">{g.side?.creditLabel}</span>
                  <p className="font-serif text-lg">{pair.credit}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {shown(g?.rules) && (
        <Section eyebrow={g.rules.eyebrow || undefined} title={g.rules.title ?? ''}>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
            {(g.rules.items ?? []).map((rule) => (
              <li className={card} key={rule.id ?? rule.heading}>
                <strong className="font-serif text-xl">{rule.heading}</strong>
                <span className="text-base text-ink-2">{rule.text}</span>
              </li>
            ))}
          </ul>
          {g.rules.source && <Source>{g.rules.source}</Source>}
        </Section>
      )}

      <ProposalBand closing={g?.closing} />
    </SponsorshipShell>
  )
}
