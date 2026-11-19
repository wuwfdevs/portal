import React from 'react'

import { fill } from '@/lib/page-content'
import { INQUIRE_HREF } from '@/lib/sponsorship/paths'

import { SectionBand } from '../SectionBand'
import { SectionActions, SectionLink, eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface OpenProgramsData extends SectionData {
  titleOne?: string | null
  titleTwo?: string | null
  emptyText?: string | null
  talkLabel?: string | null
  moreLabel?: string | null
  levelsLabel?: string | null
  recognitionLabel?: string | null
}

/** The heading for the number of programs open: its own words for one and for two, else the block's heading. */
export function titleFor(block: OpenProgramsData, count: number): string | null {
  const own = count === 1 ? block.titleOne : count === 2 ? block.titleTwo : null
  return own?.trim() || block.heading?.title?.trim() || null
}

/** Open programs. With none open it draws the empty text, or nothing when it has none. */
export async function OpenProgramsSection({ block }: SectionProps<OpenProgramsData>) {
  const { loadSponsorshipSettings } = await import('@/lib/sponsorship/load')
  const { programs } = await loadSponsorshipSettings()
  const heading = { ...block.heading, title: titleFor(block, programs.length) }
  const empty = block.emptyText?.trim()
  if (programs.length === 0 && !empty) return null
  return (
    <SectionBand block={block} heading={heading}>
      {programs.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 lg:grid-cols-2">
          {programs.map((p) => (
            <li className="flex" key={p.key}>
              <article className="flex w-full flex-col gap-4 rounded-lg border p-6 md:p-8 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
                <div className="flex flex-col gap-1">
                  <span className={eyebrowClass}>{p.kindLabel}</span>
                  <h3 className="font-serif text-3xl font-bold leading-tight">{p.name}</h3>
                </div>
                <p className="text-lg [color:var(--tone-muted)]">{p.description}</p>
                {p.levels.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {block.levelsLabel?.trim() && <strong className="text-sm">{block.levelsLabel}</strong>}
                    <ul className="m-0 flex list-none flex-col p-0">
                      {p.levels.map((l) => (
                        <li className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t py-3 [border-color:var(--tone-card-rule)]" key={l.key}>
                          <div className="flex flex-col">
                            <strong>{l.name}</strong>
                            {l.description && <span className="text-sm [color:var(--tone-muted)]">{l.description}</span>}
                          </div>
                          <strong className="text-[0.9375rem]">{l.price}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {p.recognition && (
                  <p className="text-sm [color:var(--tone-muted)]">
                    {block.recognitionLabel?.trim() && <strong>{block.recognitionLabel}</strong>} {p.recognition}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                  <SectionActions actions={[{ label: fill(block.talkLabel, { name: p.name }), href: INQUIRE_HREF }]} />
                  {p.pageUrl && <SectionLink href={p.pageUrl} label={fill(block.moreLabel, { name: p.name })} />}
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-3xl rounded-sm border p-5 text-base [background-color:var(--tone-tint)]">{empty}</p>
      )}
    </SectionBand>
  )
}
