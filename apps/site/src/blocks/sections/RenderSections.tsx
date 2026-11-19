import React from 'react'

import { sectionEntry } from './registry'
import type { SectionContext, SectionData } from './types'

/**
 * A page's sections, in order. A section marked hidden, one whose type is not (or no longer) registered, and one with nothing to show draw
 * nothing. Each section is a server component given its own data and the page context, and nothing from the request: a page that holds
 * these stays cached (PAGE-BLOCKS.md → Rendering).
 */
export function RenderSections({ sections, context }: { sections: ReadonlyArray<SectionData | null | undefined> | null | undefined; context: SectionContext }) {
  return (
    <>
      {(sections ?? []).map((block, index) => {
        if (!block || block.hidden) return null
        const entry = sectionEntry(block.blockType)
        if (!entry) return null
        const Section = entry.Component
        return <Section key={block.id ?? index} block={block} context={context} />
      })}
    </>
  )
}
