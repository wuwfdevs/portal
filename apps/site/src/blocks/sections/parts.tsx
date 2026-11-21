import Link from 'next/link'
import React from 'react'

import { buttonClasses } from '@/components/Kit/button'
import { eyebrowLabel } from '@/components/Kit/Eyebrow'
import { Media } from '@/components/Media'
import { isInternalHref, safeHref } from '@/lib/section-links'
import { cn } from '@/utilities/ui'

/**
 * Small pieces the section blocks share. Colours come from the tone (`--tone-*`, set by the page theme on the band), never from a
 * fixed token, so the same markup is right on every ground. `components/PageParts` keeps its fixed colours for the pages built before
 * sections; a block that needs one of its arrangements takes the logic (`paragraphs`, `toStats`) and draws it with the tone.
 */

export interface ActionData {
  id?: string | null
  label?: string | null
  href?: string | null
}

const primary = buttonClasses({ variant: 'tone' })
const secondary = buttonClasses({ variant: 'toneOutline' })

/** The buttons of a band: the first is filled, the others outlined. A button with no label or no safe address is not drawn. */
export function SectionActions({ actions, className }: { actions: ReadonlyArray<ActionData | null | undefined> | null | undefined; className?: string }) {
  const rows = (actions ?? []).flatMap((a) => {
    const href = safeHref(a?.href)
    const label = a?.label?.trim()
    return href && label ? [{ id: a?.id, href, label }] : []
  })
  if (rows.length === 0) return null
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {rows.map((a, i) => {
        const cls = i === 0 ? primary : secondary
        return isInternalHref(a.href) ? (
          <Link className={cls} href={a.href} key={a.id ?? `${a.href}-${i}`}>
            {a.label}
          </Link>
        ) : (
          <a className={cls} href={a.href} key={a.id ?? `${a.href}-${i}`} rel="noopener noreferrer">
            {a.label}
          </a>
        )
      })}
    </div>
  )
}

/** A link in running text or at the foot of a card. Nothing is drawn without a label or a safe address. */
export function SectionLink({ href, label, className }: { href: unknown; label: string | null | undefined; className?: string }) {
  const safe = safeHref(href)
  const text = label?.trim()
  if (!safe || !text) return null
  const cls = cn('inline-flex min-h-11 items-center self-start font-bold underline underline-offset-2 [color:var(--tone-accent)]', className)
  return isInternalHref(safe) ? (
    <Link className={cls} href={safe}>
      {text}
    </Link>
  ) : (
    <a className={cls} href={safe} rel="noopener noreferrer">
      {text}
    </a>
  )
}

/** The populated media record of an upload field, or null: a deleted picture leaves a bare id (a number), which draws nothing. */
export function populatedMedia<T extends object>(value: T | number | string | null | undefined): T | null {
  return value !== null && typeof value === 'object' ? value : null
}

/** A picture from an upload field. Draws nothing for a missing, deleted or unpopulated one. */
export function SectionImage({ image, className, imgClassName, priority }: { image: unknown; className?: string; imgClassName?: string; priority?: boolean }) {
  const media = populatedMedia(image as object | null | undefined) as import('@/payload-types').Media | null
  if (!media || !media.url) return null
  return <Media className={className} imgClassName={imgClassName} priority={priority} resource={media} />
}

/** The small label above a heading: an eyebrow, a date line. */
export const eyebrowClass = `${eyebrowLabel} [color:var(--tone-accent)]`

/** The optional link under a block's content (`moreLinkFields`). Nothing is drawn without a label or a safe address. */
export function SectionMore({ block }: { block: { moreLabel?: string | null; moreHref?: string | null } }) {
  return <SectionLink href={block.moreHref} label={block.moreLabel} />
}
