import React from 'react'

import type { VisualizationView } from '@/lib/dataviz/view'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface DataVizData extends SectionData {
  visualization?: unknown
}

/** The id of the chosen visualization, whether the relation arrived populated or bare; null when there is none. */
export function visualizationIdOf(value: unknown): number | string | null {
  if (typeof value === 'number' || (typeof value === 'string' && value !== '')) return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

/** The band around a figure that is already loaded. Draws nothing without one. */
export async function DataVizBand({ block, view }: { block: DataVizData; view: VisualizationView | null }) {
  if (!view) return null
  const { VisualizationFigure } = await import('@/components/DataViz/Figure')
  return (
    <SectionBand block={block} heading={block.heading}>
      <div className="mx-auto w-full max-w-4xl">
        <VisualizationFigure headingLevel={3} view={view} />
      </div>
    </SectionBand>
  )
}

/** Chart, map or table. Reads through the cached loader; nothing in the request is read, so the page holding it stays cached. */
export async function DataVizSection({ block }: SectionProps<DataVizData>) {
  const id = visualizationIdOf(block.visualization)
  if (id === null) return null
  const { loadVisualization } = await import('@/lib/dataviz/load')
  const loaded = await loadVisualization(id)
  return <DataVizBand block={block} view={loaded.ok ? loaded.view : null} />
}
