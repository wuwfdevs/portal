import Link from 'next/link'
import React from 'react'

import { linkOf, phoneHref, type SponsorshipContent } from '@/lib/sponsorship/content'
import { sponsorNavItems } from '@/lib/sponsorship/nav'
import { INQUIRE_HREF, SPONSOR_PATHS, type SponsorPage } from '@/lib/sponsorship/paths'
import { cn } from '@/utilities/ui'

import { buttonOnDark, Hero, Paragraphs, textLink } from '../PageParts'
import { SectionNav } from '../SectionNav'

/**
 * Pieces of the sponsorship pages (boards 16 to 20b) that are particular to them. The generic parts (hero, section, buttons, source line,
 * pills) are shared with the giving pages and live in `components/PageParts`; they are re-exported here so these views read as before.
 */
export { buttonBase, buttonOnDark, buttonOutline, buttonPrimary, card, darkPill, eyebrow, Hero, headingProps, Paragraphs, pill, Section, Source, textLink } from '../PageParts'

/** The strip under the header and the closing line every sponsorship page ends with. */
export const SponsorshipShell: React.FC<{ current: SponsorPage; content: SponsorshipContent; children: React.ReactNode }> = ({ current, content, children }) => (
  <>
    <SectionNav label={content.nav?.title?.trim() || 'For businesses'} items={sponsorNavItems(current, content.nav)} className="bg-surface-2" />
    <div className="flex-1">{children}</div>
    <SponsorshipFootnote content={content} />
  </>
)

export const SponsorshipFootnote: React.FC<{ content: SponsorshipContent }> = ({ content }) => {
  const tel = phoneHref(content.phone)
  return (
    <footer className="border-t border-rule bg-surface-2">
      <div className="container flex flex-col gap-2 py-6 text-sm text-ink-2 md:flex-row md:items-center md:justify-between">
        <p>
          {content.serviceLine}
          {content.phone && (
            <>
              {' '}
              Corporate support:{' '}
              {tel ? (
                <a className={textLink} href={tel}>
                  {content.phone}
                </a>
              ) : (
                content.phone
              )}
            </>
          )}
          {content.address && <> · {content.address}</>}
        </p>
        {content.nav?.guidelines && (
          <Link className={`${textLink} inline-flex min-h-11 items-center`} href={SPONSOR_PATHS.guidelines}>
            {content.nav.guidelines}
          </Link>
        )}
      </div>
    </footer>
  )
}

type HeroContent = { eyebrow?: string | null; title?: string | null; body?: string | null; linkLabel?: string | null; linkHref?: string | null }

/** A page's opening band from the admin's hero group. */
export const ContentHero: React.FC<{ hero: HeroContent | null | undefined; actions?: React.ReactNode; aside?: React.ReactNode }> = ({ hero, actions, aside }) => {
  const link = linkOf(hero?.linkLabel, hero?.linkHref)
  return (
    <Hero actions={actions} aside={aside} eyebrow={hero?.eyebrow ?? ''} title={hero?.title ?? ''}>
      <Paragraphs text={hero?.body} />
      {link && (
        <p>
          <Link className={textLink} href={link.href}>
            {link.label}
          </Link>
        </p>
      )}
    </Hero>
  )
}

/** A row of big figures with a line each: `<dl>` so a reader of the page hears the number and then what it counts. */
export const StatGrid: React.FC<{
  stats: readonly { value: string; text: string; compare?: string }[]
  columns?: 2 | 3 | 4
  dark?: boolean
}> = ({ stats, columns = 4, dark }) => (
  <dl
    className={cn(
      'grid grid-cols-1 gap-3 sm:grid-cols-2',
      columns === 3 && 'lg:grid-cols-3',
      columns === 4 && 'lg:grid-cols-4',
    )}
  >
    {stats.map((s) => (
      <div className={cn('flex flex-col gap-1 rounded-sm border p-5', dark ? 'border-surface-dark-line' : 'border-rule-strong bg-surface')} key={`${s.value}-${s.text}`}>
        <dd className="order-1 font-serif text-4xl font-bold leading-none">{s.value}</dd>
        <dt className={cn('order-2 text-sm font-normal', dark ? 'text-surface-dark-text' : 'text-ink-2')}>{s.text}</dt>
        {s.compare && <dd className={cn('order-3 text-sm', dark ? 'text-surface-dark-text' : 'text-ink-3')}>{s.compare}</dd>}
      </div>
    ))}
  </dl>
)

/** The closing "Get a proposal" band from the admin's closing group. Nothing is drawn without a title. */
export const ProposalBand: React.FC<{ closing: { title?: string | null; text?: string | null; label?: string | null } | null | undefined }> = ({ closing }) =>
  closing?.title ? (
    <section aria-label={closing.title} className="bg-wuwf-teal text-surface">
      <div className="container flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-2xl flex-col gap-1.5">
          <strong className="font-serif text-2xl leading-tight md:text-3xl">{closing.title}</strong>
          {closing.text && <span className="text-base text-wuwf-blue-100">{closing.text}</span>}
        </div>
        {closing.label && (
          <Link className={buttonOnDark} href={INQUIRE_HREF}>
            {closing.label}
          </Link>
        )}
      </div>
    </section>
  ) : null
