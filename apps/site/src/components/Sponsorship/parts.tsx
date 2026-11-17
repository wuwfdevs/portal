import Link from 'next/link'
import React from 'react'

import { linkOf, paragraphs, phoneHref, type SponsorshipContent } from '@/lib/sponsorship/content'
import { sponsorNavItems } from '@/lib/sponsorship/nav'
import { INQUIRE_HREF, SPONSOR_PATHS, type SponsorPage } from '@/lib/sponsorship/paths'
import { cn } from '@/utilities/ui'

import { SectionNav } from '../SectionNav'

/** Shared pieces of the sponsorship pages (boards 16 to 20b). Server components; the interactive ones sit beside this file. */

export const eyebrow = 'text-xs font-bold uppercase tracking-[0.08em]'
export const buttonBase = 'inline-flex min-h-12 items-center justify-center rounded-sm px-6 text-base font-bold no-underline hover:no-underline'
export const buttonPrimary = `${buttonBase} bg-wuwf-blue-700 text-surface hover:bg-wuwf-blue-600`
export const buttonOnDark = `${buttonBase} bg-wuwf-lime text-surface-dark hover:bg-wuwf-lime-600`
export const buttonOutline = `${buttonBase} border border-rule-strong bg-surface text-ink hover:bg-surface-2`
export const card = 'flex flex-col gap-1.5 rounded-sm border border-rule-strong bg-surface p-5'
export const textLink = 'font-semibold text-wuwf-blue-700 underline underline-offset-2'

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

/** Paragraphs from a text area. */
export const Paragraphs: React.FC<{ text: string | null | undefined; className?: string }> = ({ text, className }) => (
  <>
    {paragraphs(text).map((p) => (
      <p className={className} key={p}>
        {p}
      </p>
    ))}
  </>
)

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

/** A section's heading block from the admin's eyebrow, title and body. */
export const headingProps = (s: { eyebrow?: string | null; title?: string | null; body?: string | null } | null | undefined) => ({
  eyebrow: s?.eyebrow || undefined,
  title: s?.title ?? '',
  intro: s?.body ? <Paragraphs text={s.body} /> : undefined,
})

/** A page's opening band: a pale blue ground, the eyebrow, one h1 and a sentence or two. */
export const Hero: React.FC<{ eyebrow: string; title: string; children: React.ReactNode; actions?: React.ReactNode; aside?: React.ReactNode }> = ({
  eyebrow: label,
  title,
  children,
  actions,
  aside,
}) => (
  <section className="bg-wuwf-blue-100">
    <div className={cn('container flex flex-col gap-6 py-12 md:py-14', aside && 'lg:flex-row lg:items-end lg:gap-12')}>
      <div className="flex flex-col gap-4 lg:flex-[3]">
        {label && <span className={`${eyebrow} text-wuwf-blue-700`}>{label}</span>}
        <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">{title}</h1>
        <div className="flex max-w-3xl flex-col gap-3 text-lg text-ink-2 md:text-xl">{children}</div>
        {actions && <div className="flex flex-wrap gap-3 pt-2">{actions}</div>}
      </div>
      {aside && <div className="lg:flex-[2]">{aside}</div>}
    </div>
  </section>
)

/** A titled section. `tone` picks the ground: plain white, the light grey band, or the dark navy band. */
export const Section: React.FC<{
  id?: string
  label?: string
  eyebrow?: string
  title: string
  intro?: React.ReactNode
  tone?: 'plain' | 'grey' | 'dark'
  children: React.ReactNode
}> = ({ id, label, eyebrow: kicker, title, intro, tone = 'plain', children }) => {
  const dark = tone === 'dark'
  return (
    <section aria-label={label ?? title} className={cn(tone === 'grey' && 'bg-surface-2', dark && 'bg-surface-dark text-surface')} id={id}>
      <div className="container flex flex-col gap-6 py-12 md:py-14">
        <div className="flex max-w-3xl flex-col gap-2">
          {kicker && <span className={cn(eyebrow, dark ? 'text-wuwf-lime' : 'text-wuwf-blue-700')}>{kicker}</span>}
          <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{title}</h2>
          {intro && <div className={cn('flex flex-col gap-2 text-lg', dark ? 'text-surface-dark-text' : 'text-ink-2')}>{intro}</div>}
        </div>
        {children}
      </div>
    </section>
  )
}

/** Where a figure comes from and what it is a share of. Every figure on these pages has one nearby. */
export const Source: React.FC<{ children: React.ReactNode; dark?: boolean; className?: string }> = ({ children, dark, className }) => (
  <p className={cn('max-w-4xl text-sm', dark ? 'text-surface-dark-text' : 'text-ink-3', className)}>{children}</p>
)

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

/** A pill-shaped choice. Real buttons with `aria-pressed`; the chosen one differs by outline and weight, not by colour alone. */
export const pill = (on: boolean): string =>
  cn(
    'inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[0.9375rem] font-bold',
    on ? 'border-2 border-wuwf-blue-700 bg-wuwf-blue-100 text-wuwf-blue-700' : 'border border-rule-strong bg-surface text-ink hover:bg-surface-2',
  )

export const darkPill = (on: boolean): string =>
  cn(
    'inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[0.9375rem] font-bold',
    on ? 'border border-ink bg-ink text-surface' : 'border border-rule-strong bg-surface text-ink hover:bg-surface-2',
  )
