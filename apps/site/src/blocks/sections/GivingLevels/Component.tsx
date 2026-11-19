import React from 'react'

import { levelViews, type LevelView } from '@/lib/giving/content'
import { donationHref } from '@/lib/giving/donate'
import { cn } from '@/utilities/ui'

import { SectionBand } from '../SectionBand'
import { ToneList } from '../giving-parts'
import { SectionLink, eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface GivingLevelsData extends SectionData {
  buttonLabel?: string | null
  footnote?: string | null
  footnoteLinkLabel?: string | null
  footnoteLinkHref?: string | null
}

const FRAME: Record<LevelView['emphasis'], string> = {
  standard: 'border [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]',
  featured: 'border-2 [background-color:var(--tone-tint)] [border-color:var(--tone-accent)]',
  leadership: 'border-2 [background-color:var(--tone-card)] [border-color:var(--tone-button)]',
}

/** Giving levels. Reads them from the Giving settings, lowest first; a level needs a name and a monthly minimum, and the block draws nothing without one. */
export async function GivingLevelsSection({ block }: SectionProps<GivingLevelsData>) {
  const { loadGivingSettings } = await import('@/lib/giving/load')
  const settings = await loadGivingSettings()
  const levels = levelViews(settings.levels)
  if (levels.length === 0) return null
  const label = block.buttonLabel?.trim()
  const note = block.footnote?.trim()
  return (
    <SectionBand block={block} heading={block.heading}>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
        {levels.map((level) => {
          const href = label ? donationHref(settings.donationForm, { amount: level.minimumMonthly, frequency: 'monthly' }) : null
          return (
            <li className={cn('flex flex-col gap-2.5 rounded-lg p-6', FRAME[level.emphasis])} key={level.id}>
              {level.amount && <span className={eyebrowClass}>{level.amount}</span>}
              <strong className="font-serif text-2xl leading-tight">{level.name}</strong>
              <ToneList items={level.benefits} />
              {href && label && (
                <a className="mt-auto inline-flex min-h-11 items-center pt-2 font-bold underline underline-offset-2 [color:var(--tone-accent)]" href={href} rel="noopener">
                  {label}
                  <span className="sr-only"> ({level.name})</span>
                </a>
              )}
            </li>
          )
        })}
      </ul>
      {(note || (block.footnoteLinkLabel && block.footnoteLinkHref)) && (
        <p className="text-sm [color:var(--tone-muted)]">
          {note}{' '}
          <SectionLink className="min-h-0 self-auto" href={block.footnoteLinkHref} label={block.footnoteLinkLabel} />
        </p>
      )}
    </SectionBand>
  )
}
