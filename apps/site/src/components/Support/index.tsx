import type { SupportPage } from '@/payload-types'

import Link from 'next/link'
import React from 'react'

import { supportHref } from '@/lib/support-link'

type Level = NonNullable<SupportPage['levels']>[number]

const eyebrow = 'text-xs font-bold uppercase tracking-[0.08em]'

const levelFrame: Record<NonNullable<Level['emphasis']>, string> = {
  standard: 'border border-rule-strong bg-surface',
  featured: 'border-2 border-wuwf-blue-700 bg-wuwf-blue-100',
  leadership: 'border border-wuwf-lime-600 bg-wuwf-lime-100',
}

/** A button or link that goes nowhere unless the address is safe; with no address there is nothing to press. */
const ActionLink: React.FC<{ className: string; href: string | null | undefined; label: string | null | undefined }> = ({
  className,
  href,
  label,
}) => {
  const safe = supportHref(href)
  if (!safe || !label) return null
  const external = /^(https:|mailto:)/i.test(safe)
  return external ? (
    <a className={className} href={safe} rel="noopener">
      {label}
    </a>
  ) : (
    <Link className={className} href={safe}>
      {label}
    </Link>
  )
}

const solid =
  'inline-flex min-h-12 items-center justify-center rounded-sm px-6 text-base font-bold hover:no-underline'

export const SupportHero: React.FC<{ page: SupportPage }> = ({ page }) => {
  const figures = page.figures ?? []
  return (
    <section className="bg-surface-dark text-surface">
      <div className="container flex flex-col gap-10 py-12 md:py-16 lg:flex-row lg:items-end">
        <div className="flex flex-col gap-4 lg:flex-[3]">
          {page.eyebrow && <span className={`${eyebrow} text-wuwf-lime`}>{page.eyebrow}</span>}
          <h1 className="font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            {page.heading || 'Support WUWF'}
          </h1>
        </div>
        {figures.length > 0 && (
          <dl className="grid grid-cols-2 gap-3 lg:flex-[2]">
            {figures.map((figure) => (
              <div className="flex flex-col rounded-sm border border-surface-dark-line p-4" key={figure.id ?? figure.label}>
                <dt className="order-2 text-sm text-surface-dark-text">{figure.label}</dt>
                <dd className="font-serif text-3xl font-bold">{figure.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}

export const SupportLevels: React.FC<{ page: SupportPage }> = ({ page }) => {
  const levels = page.levels ?? []
  return (
    <section aria-labelledby="levels-heading" className="container flex flex-col gap-6 py-12 md:py-14" id="give">
      <div className="flex flex-col gap-1.5">
        {page.levelsEyebrow && <span className={`${eyebrow} text-wuwf-blue-700`}>{page.levelsEyebrow}</span>}
        <h2 className="font-serif text-3xl font-bold md:text-4xl" id="levels-heading">
          {page.levelsHeading || 'Ways to give'}
        </h2>
      </div>

      {levels.length > 0 ? (
        <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))]">
          {levels.map((level) => (
            <li
              className={`flex min-h-56 flex-col gap-2 rounded-sm p-5 ${levelFrame[level.emphasis ?? 'standard']}`}
              key={level.id ?? level.name}
            >
              {level.amount && <span className={`${eyebrow} text-ink-3`}>{level.amount}</span>}
              <h3 className="font-serif text-[1.375rem] font-bold leading-tight">{level.name}</h3>
              <p className="text-sm text-ink-2">{level.description}</p>
              <ActionLink
                className="mt-auto inline-flex min-h-11 items-center text-sm font-bold text-wuwf-blue-700"
                href={level.ctaUrl}
                label={level.ctaLabel}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-sm border border-rule-strong bg-surface-2 p-5 text-base text-ink-2">
          Ways to give are being updated. To support WUWF today, call 850 474-2787.
        </p>
      )}

      {page.otherWays && <p className="text-sm text-ink-3">{page.otherWays}</p>}
    </section>
  )
}

export const SupportBusinesses: React.FC<{ page: SupportPage }> = ({ page }) => {
  if (page.showBusinesses === false || !page.businessesHeading) return null
  return (
    <section aria-label="For businesses" className="container pb-12 md:pb-14">
      <div className="flex flex-col gap-6 rounded-md bg-surface-dark p-6 text-surface md:flex-row md:items-center md:justify-between md:p-8">
        <div className="flex flex-col gap-2 md:max-w-2xl">
          {page.businessesEyebrow && <span className={`${eyebrow} text-wuwf-lime`}>{page.businessesEyebrow}</span>}
          <h2 className="font-serif text-3xl font-bold leading-tight">{page.businessesHeading}</h2>
          {page.businessesBody && <p className="text-base text-surface-dark-text">{page.businessesBody}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionLink
            className={`${solid} bg-wuwf-lime text-surface-dark`}
            href={page.businessesPrimaryUrl}
            label={page.businessesPrimaryLabel}
          />
          <ActionLink
            className={`${solid} border border-surface-dark-line text-surface`}
            href={page.businessesSecondaryUrl}
            label={page.businessesSecondaryLabel}
          />
        </div>
      </div>
    </section>
  )
}

export const SupportFellowships: React.FC<{ page: SupportPage }> = ({ page }) => {
  if (page.showFellowships === false || !page.fellowshipsHeading) return null
  const commitments = page.commitments ?? []
  return (
    <section aria-label="Fund reporting" className="bg-wuwf-teal text-surface">
      <div className="container flex flex-col gap-10 py-12 md:py-14 lg:flex-row">
        <div className="flex flex-col gap-3.5 lg:flex-1">
          {page.fellowshipsEyebrow && <span className={`${eyebrow} text-wuwf-lime`}>{page.fellowshipsEyebrow}</span>}
          <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{page.fellowshipsHeading}</h2>
          {page.fellowshipsBody && <p className="text-lg text-wuwf-blue-100">{page.fellowshipsBody}</p>}
          <ActionLink
            className={`${solid} self-start bg-wuwf-lime text-surface-dark`}
            href={page.fellowshipsLinkUrl}
            label={page.fellowshipsLinkLabel}
          />
        </div>
        {commitments.length > 0 && (
          <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:flex-1">
            {commitments.map((item) => (
              <li className="rounded-sm bg-surface-dark/50 p-4" key={item.id ?? item.heading}>
                <strong className="block">{item.heading}</strong>
                <span className="text-sm text-wuwf-blue-100">{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
