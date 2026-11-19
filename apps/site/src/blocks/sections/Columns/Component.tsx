import React from 'react'

import { cn } from '@/utilities/ui'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface ColumnsData extends SectionData {
  columns?: Array<{ id?: string | null; sections?: Array<SectionData | null> | null } | null> | null
  placement?: string | null
}

// Written out whole, so Tailwind generates them.
const GRID: Record<string, string> = {
  'equal-2': 'lg:grid-cols-2',
  'equal-3': 'lg:grid-cols-3',
  'left-wide-2': 'lg:grid-cols-[2fr_1fr]',
  'left-wide-3': 'lg:grid-cols-[2fr_1fr_1fr]',
  'right-wide-2': 'lg:grid-cols-[1fr_2fr]',
  'right-wide-3': 'lg:grid-cols-[1fr_1fr_2fr]',
}

/** The sections a column holds that can be drawn: not hidden, and never another Columns block (one level only). */
export const heldBy = (col: NonNullable<ColumnsData['columns']>[number]): SectionData[] =>
  (col?.sections ?? []).filter((s): s is SectionData => Boolean(s) && s!.blockType !== 'sectionColumns' && !s!.hidden)

/** Columns. Draws nothing when no column holds anything. Each held section is drawn inline: the band around it is this block's. */
export async function ColumnsSection({ block, context }: SectionProps<ColumnsData>) {
  const cols = (block.columns ?? []).filter((c): c is NonNullable<typeof c> => Boolean(c)).slice(0, 3)
  const filled = cols.filter((c) => heldBy(c).length > 0)
  if (filled.length === 0) return null
  // RenderSections imports the registry, which imports this file: loaded when it draws, as the data blocks load their loaders.
  const { RenderSections } = await import('../RenderSections')
  const variant = block.variant === 'left-wide' || block.variant === 'right-wide' ? block.variant : 'equal'
  const grid = GRID[`${variant}-${filled.length === 3 ? 3 : 2}`]
  return (
    <SectionBand block={block} heading={block.heading}>
      <div className={cn('grid items-start gap-8 lg:gap-10', grid)}>
        {filled.map((col, i) => (
          <div className="flex min-w-0 flex-col gap-8" key={col.id ?? i}>
            <RenderSections context={context} sections={heldBy(col).map((s) => ({ ...s, inline: true }))} />
          </div>
        ))}
      </div>
    </SectionBand>
  )
}
