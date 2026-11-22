import React from 'react'

import type { DataVizBlock as DataVizBlockProps } from '@/payload-types'

/**
 * A visualization in a story. The loader and the figure are imported when it draws, not at the top of the file: this component is reachable from
 * the Payload config (through the story renderer), and the loader reads the config.
 */
export const DataVizBlock: React.FC<DataVizBlockProps> = async ({ visualization, size }) => {
  // A deleted visualization leaves a bare id or nothing; a populated record carries its id.
  const id = typeof visualization === 'object' && visualization !== null ? visualization.id : visualization
  if (id === undefined || id === null) return null
  const [{ loadVisualization }, { VisualizationFigure }] = await Promise.all([import('@/lib/dataviz/load'), import('@/components/DataViz/Figure')])
  const loaded = await loadVisualization(id)
  if (!loaded.ok) return null
  return <VisualizationFigure size={size === 'wide' ? 'wide' : 'column'} view={loaded.view} />
}
