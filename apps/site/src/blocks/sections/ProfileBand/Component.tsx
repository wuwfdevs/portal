import React from 'react'

import { paragraphs } from '@/lib/page-content'

import { SectionBand, SectionHeading } from '../SectionBand'
import { SectionImage, populatedMedia } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface ProfileBandData extends SectionData {
  text?: string | null
  image?: unknown
  people?: Array<{ id?: string | null; name?: string | null; role?: string | null; photo?: unknown } | null> | null
}

const hasPicture = (m: unknown): boolean => populatedMedia(m as object | null | undefined) !== null && Boolean((m as { url?: string | null }).url)

/** Profile band. `about`: paragraphs with a picture. `roster`: a person needs a name; a deleted photo (a bare id) leaves the name and role. */
export function ProfileBandSection({ block }: SectionProps<ProfileBandData>) {
  if (block.variant === 'roster') {
    const people = (block.people ?? []).filter((p): p is NonNullable<typeof p> => Boolean(p?.name?.trim()))
    if (people.length === 0) return null
    return (
      <SectionBand block={block} heading={block.heading}>
        <ul className="grid list-none grid-cols-2 gap-4 p-0 sm:gap-6 lg:grid-cols-4">
          {people.map((p, i) => (
            <li className="flex flex-col gap-3" key={p.id ?? `${p.name}-${i}`}>
              {hasPicture(p.photo) && (
                <div className="aspect-square overflow-hidden rounded-sm">
                  <SectionImage className="size-full" image={p.photo} imgClassName="size-full object-cover" />
                </div>
              )}
              <div className="flex flex-col">
                <strong className="text-lg">{p.name}</strong>
                {p.role?.trim() && <span className="[color:var(--tone-muted)]">{p.role}</span>}
              </div>
            </li>
          ))}
        </ul>
      </SectionBand>
    )
  }
  const paras = paragraphs(block.text)
  if (paras.length === 0) return null
  const picture = hasPicture(block.image)
  return (
    <SectionBand block={block}>
      <div className={picture ? 'grid items-center gap-8 md:grid-cols-2 md:gap-12' : ''}>
        <div className="flex flex-col gap-4">
          <SectionHeading heading={block.heading} />
          <div className="flex max-w-2xl flex-col gap-3 text-lg">
            {paras.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
        {picture && (
          <div className="aspect-[4/3] overflow-hidden rounded-sm">
            <SectionImage className="size-full" image={block.image} imgClassName="size-full object-cover" />
          </div>
        )}
      </div>
    </SectionBand>
  )
}
