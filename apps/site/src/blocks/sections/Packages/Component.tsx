import React from 'react'

import { packageViews } from '@/lib/sponsorship/packages'

import { SectionBand } from '../SectionBand'
import { eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface PackagesData extends SectionData {
  packageLabel?: string | null
  note?: string | null
}

/** Packages. Reads them from the Sponsorship settings; a package needs a name and a price, and the block draws nothing without one. */
export async function PackagesSection({ block }: SectionProps<PackagesData>) {
  const { loadSponsorshipSettings } = await import('@/lib/sponsorship/load')
  const { settings } = await loadSponsorshipSettings()
  const packages = packageViews(settings.packages)
  if (packages.length === 0) return null
  const note = block.note?.trim()
  return (
    <SectionBand block={block} heading={block.heading}>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {packages.map((p) => (
          <li className="flex" key={p.key}>
            <article className="flex w-full flex-col gap-2 rounded-lg border p-5 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
              <span className={eyebrowClass}>
                {block.packageLabel?.trim()} {p.number}
              </span>
              <h3 className="font-serif text-xl font-bold">{p.name}</h3>
              {p.description && <p className="text-base [color:var(--tone-muted)]">{p.description}</p>}
              <strong className="mt-auto pt-3 font-serif text-4xl leading-none">{p.price}</strong>
              {p.valueLine && <span className="text-sm [color:var(--tone-muted)]">{p.valueLine}</span>}
            </article>
          </li>
        ))}
      </ul>
      {note && <p className="text-sm [color:var(--tone-muted)]">{note}</p>}
    </SectionBand>
  )
}
