import React from 'react'

import {
  GUIDELINES_INCLUDES,
  GUIDELINES_LEAVES_OUT,
  GUIDELINES_RULES,
  GUIDELINES_SIDE_BY_SIDE,
  GUIDELINES_SOURCE,
} from '@/lib/sponsorship/content'

import { Hero, ProposalBand, Section, Source, SponsorshipShell, card } from './parts'

/** Board 20b: Credit guidelines. What a credit can and can’t say, from NPR’s sponsor recognition guidelines. */
export const GuidelinesView: React.FC = () => (
  <SponsorshipShell current="guidelines">
    <Hero eyebrow="Credit guidelines" title="What a WUWF sponsor credit says">
      <p>
        A credit names the business that supports WUWF and thanks it. It isn’t a commercial. These guidelines follow NPR’s sponsor recognition guidelines and the FCC rules behind them, and they apply on air and online.
      </p>
    </Hero>

    <div className="container grid gap-6 py-12 md:py-14 lg:grid-cols-2">
      <section aria-labelledby="includes" className="flex flex-col gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-wuwf-blue-700">A credit includes</span>
        <h2 className="font-serif text-3xl font-bold leading-tight" id="includes">
          Who you are, what you do, where to learn more
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {GUIDELINES_INCLUDES.map((item) => (
            <li className="flex gap-3 rounded-sm border border-rule-strong bg-surface p-3 text-base" key={item}>
              <span aria-hidden="true" className="font-bold text-success-fg">
                +
              </span>
              <span>
                <span className="sr-only">Includes: </span>
                {item}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="leaves-out" className="flex flex-col gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-wuwf-blue-700">A credit leaves out</span>
        <h2 className="font-serif text-3xl font-bold leading-tight" id="leaves-out">
          Anything that promotes
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {GUIDELINES_LEAVES_OUT.map((item) => (
            <li className="flex gap-3 rounded-sm border border-rule-strong bg-surface p-3 text-base" key={item.heading}>
              <span aria-hidden="true" className="font-bold text-on-air-red">
                −
              </span>
              <span>
                <span className="sr-only">Leaves out: </span>
                <strong>{item.heading}</strong>
                <span className="block text-sm text-ink-2">{item.examples}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>

    <Section
      eyebrow="Side by side"
      intro={<p>Illustrations only. These businesses aren’t real sponsors.</p>}
      label="An ad and a credit, side by side"
      title="The same business, two ways"
      tone="grey"
    >
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {GUIDELINES_SIDE_BY_SIDE.map((pair) => (
          <li className="grid gap-4 md:grid-cols-2" key={pair.credit}>
            <div className={`${card} bg-surface`}>
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">An ad would say</span>
              <p className="font-serif text-lg text-ink-2">{pair.ad}</p>
            </div>
            <div className={`${card} border-wuwf-blue-700 bg-wuwf-blue-100`}>
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-wuwf-blue-700">A credit says</span>
              <p className="font-serif text-lg">{pair.credit}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>

    <Section eyebrow="The rules behind it" label="More rules" title="A few more things worth knowing">
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
        {GUIDELINES_RULES.map((rule) => (
          <li className={card} key={rule.heading}>
            <strong className="font-serif text-xl">{rule.heading}</strong>
            <span className="text-base text-ink-2">{rule.text}</span>
          </li>
        ))}
      </ul>
      <Source>{GUIDELINES_SOURCE}</Source>
    </Section>

    <ProposalBand text="Corporate support will draft your credit with you and check it against these guidelines." title="Not sure how to word yours?" />
  </SponsorshipShell>
)
