import React from 'react'

import { featuredSpecOf } from '@/lib/section-data/specs'
import type { FeaturedItem } from '@/lib/section-data/shape'

import { FeatureSection } from '../Feature/Component'
import type { SectionData, SectionProps } from '../types'

export interface FeaturedRecordData extends SectionData {
  mode?: string | null
  record?: unknown
  section?: unknown
  label?: string | null
  actionLabel?: string | null
  ratio?: string | null
  imageSide?: string | null
}

/** The Feature layout over what a record says: the same two variants, drawn by the same component. */
export function FeaturedRecordView({ block, item, context }: SectionProps<FeaturedRecordData> & { item: FeaturedItem }) {
  const show = item.kind === 'show'
  const label = block.label?.trim() || (show ? 'Show' : 'Story')
  const actionLabel = block.actionLabel?.trim() || (show ? 'See the show' : 'Read the story')
  return (
    <FeatureSection
      block={{
        blockType: block.blockType,
        id: block.id,
        anchor: block.anchor,
        tone: block.tone,
        variant: block.variant,
        label,
        headline: item.title,
        line: item.description,
        actions: item.href ? [{ label: actionLabel, href: item.href }] : [],
        image: item.image,
        audio: item.audio,
        ratio: block.ratio,
        imageSide: block.imageSide,
      }}
      context={context}
    />
  )
}

/** Featured record. Draws nothing when no record is chosen, or when it is deleted or not published. A failed read is an error, not an empty band. */
export async function FeaturedRecordSection({ block, context }: SectionProps<FeaturedRecordData>) {
  const spec = featuredSpecOf(block)
  if (!spec) return null
  const { loadFeatured } = await import('@/lib/section-data/load')
  const item = await loadFeatured(spec)
  return item ? <FeaturedRecordView block={block} context={context} item={item} /> : null
}
