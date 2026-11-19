import React from 'react'

import { PlayAudioButton } from '@/components/ListenLive/PlayAudioButton'
import { paragraphs } from '@/lib/page-content'
import { trackFromAudio } from '@/lib/player/track'
import { cn } from '@/utilities/ui'

import { SectionBand } from '../SectionBand'
import { type ActionData, SectionActions, SectionImage, eyebrowClass, populatedMedia } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface FeatureData extends SectionData {
  label?: string | null
  headline?: string | null
  line?: string | null
  actions?: ActionData[] | null
  image?: unknown
  audio?: unknown
  ratio?: string | null
  imageSide?: string | null
}

const RATIO_CLASS: Record<string, string> = { portrait: 'aspect-[4/5]', standard: 'aspect-[4/3]', wide: 'aspect-video' }
const ratioClass = (r: unknown): string => (typeof r === 'string' && RATIO_CLASS[r]) || RATIO_CLASS.standard!

/** Feature. Draws nothing without a headline. A deleted picture or audio file (a bare id) is left out; the words still draw. */
export function FeatureSection({ block }: SectionProps<FeatureData>) {
  const headline = block.headline?.trim()
  if (!headline) return null
  const split = block.variant === 'split'
  const label = block.label?.trim()
  const lines = paragraphs(block.line)
  const audio = populatedMedia(block.audio as { id: number; url?: string | null; title?: string | null; credit?: string | null; durationSeconds?: number | null } | null | undefined)
  const track = audio ? trackFromAudio(audio as Parameters<typeof trackFromAudio>[0], { title: headline }) : null
  const hasImage = populatedMedia(block.image as object | null | undefined) !== null && Boolean((block.image as { url?: string | null }).url)

  const words = (
    <div className="flex min-w-0 flex-col items-start gap-4">
      {label && <p className={eyebrowClass}>{label}</p>}
      {split ? (
        <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{headline}</h2>
      ) : (
        <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">{headline}</h1>
      )}
      {lines.length > 0 && (
        <div className="flex max-w-2xl flex-col gap-3 text-lg md:text-xl">
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
      <SectionActions actions={block.actions} className="pt-2" />
      {track && <PlayAudioButton track={track} />}
    </div>
  )

  if (split) {
    return (
      <SectionBand block={block}>
        <div className={cn('grid items-center gap-8 md:grid-cols-2 md:gap-12', !hasImage && 'md:grid-cols-1')}>
          <div className={cn(block.imageSide === 'left' && 'md:order-2')}>{words}</div>
          {hasImage && (
            <div className={cn('overflow-hidden rounded-sm', ratioClass(block.ratio), block.imageSide === 'left' && 'md:order-1')}>
              <SectionImage className="size-full" image={block.image} imgClassName="size-full object-cover" />
            </div>
          )}
        </div>
      </SectionBand>
    )
  }
  return (
    <SectionBand block={block}>
      {words}
      {hasImage && (
        <div className="aspect-video overflow-hidden rounded-sm">
          <SectionImage className="size-full" image={block.image} imgClassName="size-full object-cover" priority />
        </div>
      )}
    </SectionBand>
  )
}
