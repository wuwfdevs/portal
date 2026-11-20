import React from 'react'

import { Card } from '@/components/Card'
import { withLeadPicture } from '@/components/Card/withLeadPicture'
import { leadFrameClass, leadSpanClass } from '@/lib/homepage/modules'
import { cn } from '@/utilities/ui'

type CardDoc = Parameters<typeof withLeadPicture>[0]

/**
 * A grid of story cards: two across on a tablet and three on a wide screen (two beside a rail). The home page's news runs, the stories under a section's lead and the
 * News run block all draw their cards through this, so a card sits the same on each. `spanFirst` makes the first card span columns so the last row is never short
 * (`leadSpanClass`, `lib/homepage/modules.ts`), and gives it a wider picture frame (`leadFrameClass`) so it is not as tall as the row and the card beside it does not stretch.
 * The home page's runs use it, a list page's grid does not.
 */
export function StoryGrid<T extends CardDoc & { id: string | number }>({ stories, spanFirst = false, beside = false, className }: { stories: readonly T[]; spanFirst?: boolean; beside?: boolean; className?: string }) {
  if (stories.length === 0) return null
  return (
    <ul className={cn('grid gap-6 sm:grid-cols-2', beside ? 'lg:grid-cols-2' : 'lg:grid-cols-3', className)}>
      {stories.map((story, i) => (
        // The first card spans columns so the grid has no short last row (leadSpanClass); a rail narrows the grid, where the span does not apply.
        <li className={cn(spanFirst && !beside && i === 0 && leadSpanClass(stories.length))} key={story.id}>
          <Card className="h-full" doc={withLeadPicture(story)} fixedImage frameClassName={spanFirst && !beside && i === 0 ? leadFrameClass(stories.length) : undefined} showCategories />
        </li>
      ))}
    </ul>
  )
}
