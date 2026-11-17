import React from 'react'

import type { GivingContent } from '@/lib/giving/content'
import { shown } from '@/lib/page-content'

import { eyebrow, Faq, headingProps, Hero, Paragraphs, Section, StepGrid } from '../PageParts'
import { ContactActions, GivingShell } from './parts'

/** The sample sentence with its fill-in-the-blank parts, [in brackets], set in italics so a reader sees what to replace. */
const WithBlanks: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\[[^\]]+\])/).map((part, i) => (part.startsWith('[') && part.endsWith(']') ? <em key={i}>{part}</em> : <React.Fragment key={i}>{part}</React.Fragment>))}
  </>
)

/** Leave a legacy (board 14c): a plain, low-pressure page. The easiest route first; nothing here asks for a decision. */
export function LegacyView({ content }: { content: GivingContent }) {
  const l = content.legacy
  const card = l?.contactCard

  const contact = card?.title ? (
    <div className="flex flex-col gap-3 rounded-md bg-surface p-7 text-ink">
      <strong className="font-serif text-2xl leading-tight">{card.title}</strong>
      {card.text && <span className="text-base text-ink-2">{card.text}</span>}
      {(content.phone || content.email) && (
        <div className="flex flex-col gap-1 text-base">
          {content.phone && <strong>{content.phone}</strong>}
          {card.note && <span className="text-ink-3">{[content.email, card.note].filter(Boolean).join('. ')}</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2.5">
        <ContactActions callLabel={card.callLabel} content={content} emailLabel={card.emailLabel} />
      </div>
    </div>
  ) : undefined

  return (
    <GivingShell content={content} current="legacy">
      <Hero aside={contact} asideAlign="start" eyebrow={l?.hero?.eyebrow ?? ''} title={l?.hero?.title ?? ''} tone="dark">
        <Paragraphs text={l?.hero?.body} />
      </Hero>

      {shown(l?.routes) && (
        <Section {...headingProps(l.routes)}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(l.routes.items ?? []).map((item) => (
              <div className="flex flex-col gap-2.5 rounded-sm border border-rule-strong bg-surface p-6" key={item.id ?? item.title}>
                {item.tag && <span className={`${eyebrow} text-ink-3`}>{item.tag}</span>}
                <strong className="font-serif text-2xl leading-tight">{item.title}</strong>
                <span className="text-base text-ink-2">{item.text}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {shown(l?.sample) && l.sample.quote && (
        <section aria-label={l.sample.title ?? 'Sample language'} className="bg-surface-2">
          <div className="container flex flex-col gap-10 py-12 md:py-14 lg:flex-row lg:items-start">
            <div className="flex flex-col gap-3 lg:flex-1">
              {l.sample.eyebrow && <span className={`${eyebrow} text-wuwf-blue-700`}>{l.sample.eyebrow}</span>}
              <h2 className="font-serif text-4xl font-bold leading-tight">{l.sample.title}</h2>
              {l.sample.body && <p className="text-base text-ink-2">{l.sample.body}</p>}
            </div>
            <blockquote className="m-0 flex flex-col gap-3 rounded-r-sm border-l-4 border-wuwf-blue-700 bg-surface p-6 lg:flex-[1.2]">
              <p className="font-serif text-[1.1875rem] leading-normal">
                <WithBlanks text={l.sample.quote} />
              </p>
              {l.sample.quoteNote && <footer className="text-sm text-ink-3">{l.sample.quoteNote}</footer>}
            </blockquote>
          </div>
        </section>
      )}

      {shown(l?.steps) && (
        <Section {...headingProps(l.steps)}>
          <StepGrid steps={l.steps.items} />
        </Section>
      )}

      {shown(l?.recognition) && l.recognition.text && (
        <section aria-label={l.recognition.eyebrow ?? 'Recognition'} className="container pb-12 md:pb-14">
          <div className="flex max-w-3xl flex-col gap-2.5 rounded-md bg-wuwf-lime-100 p-8">
            {l.recognition.eyebrow && <span className={`${eyebrow} text-wuwf-blue-700`}>{l.recognition.eyebrow}</span>}
            <p className="text-xl text-ink">{l.recognition.text}</p>
          </div>
        </section>
      )}

      {shown(l?.faq) && (l.faq.items?.length ?? 0) > 0 && (
        <Section title={l.faq.title ?? 'Questions'}>
          <Faq items={l.faq.items} />
        </Section>
      )}
    </GivingShell>
  )
}
