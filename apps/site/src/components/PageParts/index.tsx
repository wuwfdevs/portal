import Link from 'next/link'
import React from 'react'

import { buttonClasses, type ButtonVariant as KitButtonVariant } from '@/components/Kit/button'
import { eyebrowLabel } from '@/components/Kit/Eyebrow'
import { linkOf, paragraphs } from '@/lib/page-content'
import { supportHref } from '@/lib/support-link'
import { cn } from '@/utilities/ui'

/**
 * The parts public pages are made from when their words live in the admin (the sponsorship pages, the giving pages): a hero, a
 * titled section, buttons, a question list, numbered steps, check lists, link cards, a contact band. Server components; the one
 * interactive piece (`CopyButton`) sits beside this file. Colours, type and spacing are the design system's tokens, never a
 * one-off value. A page that needs the same arrangement a second time uses these instead of building its own.
 */

export const eyebrow = eyebrowLabel
const lg = (variant: KitButtonVariant) => buttonClasses({ variant, size: 'lg' })
export const buttonPrimary = lg('action')
export const buttonOnDark = lg('onDark')
export const buttonOutline = lg('outline')
export const buttonOutlineOnDark = lg('outlineOnDark')
export const card = 'flex flex-col gap-1.5 rounded-sm border border-rule-strong bg-surface p-5'
export const textLink = 'font-semibold text-wuwf-blue-700 underline underline-offset-2'

/** A link address that is safe to draw: this site, a secure address, mailto:, or a telephone number. Anything else draws nothing. */
export const safeHref = (value: string | null | undefined): string | null => {
  const href = supportHref(value)
  if (href) return href
  const tel = value?.trim() ?? ''
  return /^tel:\+?\d{7,15}$/.test(tel) ? tel : null
}

export type ButtonVariant = 'primary' | 'onDark' | 'outline' | 'outlineOnDark'
const buttonClass: Record<ButtonVariant, string> = { primary: buttonPrimary, onDark: buttonOnDark, outline: buttonOutline, outlineOnDark: buttonOutlineOnDark }

/** A button-shaped link. With no label or no safe address nothing is drawn, so an empty admin field never leaves a dead button. */
export const ButtonLink: React.FC<{ href: string | null | undefined; label: string | null | undefined; variant?: ButtonVariant; className?: string }> = ({
  href,
  label,
  variant = 'primary',
  className,
}) => {
  const safe = safeHref(href)
  if (!safe || !label?.trim()) return null
  const cls = cn(buttonClass[variant], className)
  return safe.startsWith('/') ? (
    <Link className={cls} href={safe}>
      {label}
    </Link>
  ) : (
    <a className={cls} href={safe} rel={safe.startsWith('https:') ? 'noopener' : undefined}>
      {label}
    </a>
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

/** A section's heading block from the admin's eyebrow, title and body. */
export const headingProps = (s: { eyebrow?: string | null; title?: string | null; body?: string | null } | null | undefined) => ({
  eyebrow: s?.eyebrow || undefined,
  title: s?.title ?? '',
  intro: s?.body ? <Paragraphs text={s.body} /> : undefined,
})

export type HeroTone = 'blue' | 'dark' | 'grey' | 'lime'
const heroGround: Record<HeroTone, string> = {
  blue: 'bg-wuwf-blue-100',
  dark: 'bg-surface-dark text-surface',
  grey: 'border-b border-rule bg-surface-2',
  lime: 'border-b border-rule bg-wuwf-lime-100',
}

/**
 * A page's opening band: the eyebrow, one h1 and a sentence or two, with an optional aside (a card, a form). `tone` picks the
 * ground: the pale blue sections open with, the dark navy of a page that leads with an ask, the light grey of a reference page,
 * or the pale lime of a thank-you.
 */
export const Hero: React.FC<{
  eyebrow: string
  title: string
  children?: React.ReactNode
  actions?: React.ReactNode
  aside?: React.ReactNode
  /** Full width under the text and aside: a row of choices that belongs to the opening band. */
  below?: React.ReactNode
  tone?: HeroTone
  /** Where the aside sits against the text: level with the foot of it (the default) or with the top. */
  asideAlign?: 'end' | 'start'
}> = ({ eyebrow: label, title, children, actions, aside, below, tone = 'blue', asideAlign = 'end' }) => {
  const dark = tone === 'dark'
  return (
    <section className={heroGround[tone]}>
      <div className="container flex flex-col gap-8 py-12 md:py-14">
        <div className={cn('flex flex-col gap-6', aside && cn('lg:flex-row lg:gap-12', asideAlign === 'end' ? 'lg:items-end' : 'lg:items-start'))}>
          <div className="flex min-w-0 flex-col gap-4 lg:flex-[3]">
            {label && <span className={cn(eyebrow, dark ? 'text-wuwf-lime' : 'text-wuwf-blue-700')}>{label}</span>}
            <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">{title}</h1>
            {children && <div className={cn('flex max-w-3xl flex-col gap-3 text-lg md:text-xl', dark ? 'text-surface-dark-text' : 'text-ink-2')}>{children}</div>}
            {actions && <div className="flex flex-wrap gap-3 pt-2">{actions}</div>}
          </div>
          {aside && <div className="min-w-0 lg:flex-[2]">{aside}</div>}
        </div>
        {below}
      </div>
    </section>
  )
}

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

export type FaqItem = { id?: string | null; question?: string | null; answer?: string | null; linkLabel?: string | null; linkHref?: string | null }

/** Questions and answers that open one at a time: real `<details>`, so they work without script and by keyboard. */
export const Faq: React.FC<{ items: readonly FaqItem[] | null | undefined; className?: string }> = ({ items, className }) => {
  const rows = (items ?? []).filter((f) => f.question?.trim() && f.answer?.trim())
  if (rows.length === 0) return null
  return (
    <div className={cn('flex max-w-3xl flex-col', className)}>
      {rows.map((f) => {
        const link = linkOf(f.linkLabel, f.linkHref)
        const href = link ? safeHref(link.href) : null
        return (
          <details className="group border-t border-rule last:border-b" key={f.id ?? f.question}>
            <summary className="flex min-h-14 cursor-pointer items-center py-2 font-serif text-xl font-bold">{f.question}</summary>
            <div className="flex flex-col gap-2 pb-4 text-base text-ink-2">
              <Paragraphs text={f.answer} />
              {link && href && (
                <Link className={`${textLink} inline-flex min-h-11 items-center self-start`} href={href}>
                  {link.label}
                </Link>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}

export type StepItem = { id?: string | null; title?: string | null; text?: string | null }

/** Steps as a ruled grid with a large numeral each: "after you give", "how it works". An ordered list, so the numbers are real. */
export const StepGrid: React.FC<{ steps: readonly StepItem[] | null | undefined }> = ({ steps }) => {
  const rows = (steps ?? []).filter((s) => s.title?.trim())
  if (rows.length === 0) return null
  return (
    <ol className="grid list-none grid-cols-1 gap-px border border-rule-strong bg-rule-strong p-0 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
      {rows.map((s, i) => (
        <li className="flex flex-col gap-2 bg-surface p-6" key={s.id ?? s.title}>
          <span aria-hidden="true" className="font-serif text-4xl font-bold leading-none text-wuwf-blue-700">
            {i + 1}
          </span>
          <strong className="text-lg">{s.title}</strong>
          {s.text && <span className="text-[0.9375rem] text-ink-2">{s.text}</span>}
        </li>
      ))}
    </ol>
  )
}

/** Steps as a compact list with a small numbered circle each, for a panel beside other content. */
export const StepList: React.FC<{ steps: readonly { id?: string | null; text?: string | null }[] | null | undefined; title?: string }> = ({ steps, title }) => {
  const rows = (steps ?? []).filter((s) => s.text?.trim())
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-rule-strong bg-surface p-6">
      {title && <strong className="text-base">{title}</strong>}
      <ol className="flex list-none flex-col gap-3 p-0 text-[0.9375rem] text-ink-2">
        {rows.map((s, i) => (
          <li className="flex gap-3" key={s.id ?? s.text}>
            <span aria-hidden="true" className="inline-flex size-[1.625rem] shrink-0 items-center justify-center rounded-full bg-wuwf-blue-100 text-[0.8125rem] font-bold text-wuwf-blue-700">
              {i + 1}
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** A list whose lines each lead with a mark (a tick for what you get, a dot for things to know). The mark is decoration; the line says it. */
export const CheckList: React.FC<{ items: readonly (string | null | undefined)[] | null | undefined; mark?: '✓' | '•'; className?: string }> = ({ items, mark = '✓', className }) => {
  const rows = (items ?? []).map((t) => t?.trim() ?? '').filter(Boolean)
  if (rows.length === 0) return null
  return (
    <ul className={cn('flex list-none flex-col gap-1.5 p-0 text-[0.9375rem] text-ink-2', className)}>
      {rows.map((t) => (
        <li className="flex gap-2.5" key={t}>
          <span aria-hidden="true" className="font-bold text-wuwf-blue-700">
            {mark}
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

export type LinkCardItem = { id?: string | null; title?: string | null; text?: string | null; href?: string | null }

/** A grid of whole-card links, each a title and a line. A card with no safe address is left out rather than drawn dead. */
export const LinkCards: React.FC<{ items: readonly LinkCardItem[] | null | undefined; className?: string }> = ({ items, className }) => {
  const rows = (items ?? []).flatMap((item) => {
    const href = safeHref(item.href)
    return item.title?.trim() && href ? [{ item, href }] : []
  })
  if (rows.length === 0) return null
  return (
    <ul className={cn('grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {rows.map(({ item, href }) => (
        <li key={item.id ?? item.title}>
          <Link
            className="flex h-full min-h-11 flex-col gap-1.5 rounded-sm border border-rule-strong bg-surface p-5 text-ink no-underline hover:border-wuwf-blue-700 hover:no-underline"
            href={href}
          >
            <strong className="text-[1.0625rem] text-wuwf-blue-700">{item.title}</strong>
            {item.text && <span className="text-[0.9375rem] text-ink-2">{item.text}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** A dark closing band: a short heading and a sentence on the left, one or two buttons on the right. Nothing is drawn without a title. */
export const ContactBand: React.FC<{ id?: string; title: string | null | undefined; text?: string | null; actions?: React.ReactNode }> = ({ id, title, text, actions }) =>
  title?.trim() ? (
    <section aria-label={title} className="bg-surface-dark text-surface" id={id}>
      <div className="container flex flex-col gap-6 py-12 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <strong className="font-serif text-3xl leading-tight">{title}</strong>
          {text && <span className="text-[1.0625rem] text-surface-dark-text">{text}</span>}
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
    </section>
  ) : null
