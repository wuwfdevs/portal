import React from 'react'

import { Card } from '@/components/Card'
import { withLeadPicture } from '@/components/Card/withLeadPicture'
import { LEAD_ROW, restGridClass } from '@/lib/homepage/modules'
import { cn } from '@/utilities/ui'

type CardDoc = Parameters<typeof withLeadPicture>[0]

/**
 * A grid of story cards: two across on a tablet and three on a wide screen (two beside a rail). The home page's news runs, the stories under a section's lead and the
 * News run block all draw their cards through this, so a card sits the same on each.
 *
 * `spanFirst` gives the first story a row of its own (`LEAD_ROW`: the picture left, the headline and summary right), a rule under it, and the rest in an even grid below
 * (`restGridClass`), so the lead is plainly the lead and no card shares its row. It does not apply beside a rail or to a single story. A list page's grid does not use it.
 * `variant` is the cards' look (`Card`): the home page's runs are `editorial`; a list page keeps `default` until its own pass. `showSection` and `showDate` are passed to
 * each card: a run under its own section's heading turns the chip off and the date on.
 */
export function StoryGrid<T extends CardDoc & { id: string | number }>({
  stories,
  spanFirst = false,
  beside = false,
  variant = 'default',
  showSection = true,
  showDate = false,
  className,
}: {
  stories: readonly T[]
  spanFirst?: boolean
  beside?: boolean
  variant?: 'default' | 'editorial'
  showSection?: boolean
  showDate?: boolean
  className?: string
}) {
  if (stories.length === 0) return null
  const card = (story: T, lead?: typeof LEAD_ROW) => <Card className="h-full" doc={withLeadPicture(story)} fixedImage lead={lead} showCategories showDate={showDate} showSection={showSection} variant={variant} />
  const gap = cn('gap-6', variant === 'editorial' && 'gap-y-8')
  if (spanFirst && !beside && stories.length > 1) {
    const [first, ...rest] = stories
    return (
      <div className={cn('flex flex-col gap-8', className)}>
        {/* The lead, alone on its row, with a rule under it that sets it apart from the list. */}
        <div className="border-b border-rule pb-8">
          {card(first!, LEAD_ROW)}
        </div>
        <ul className={cn('grid', gap, restGridClass(rest.length))}>
          {rest.map((story) => (
            <li key={story.id}>{card(story)}</li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <ul className={cn('grid sm:grid-cols-2', gap, beside ? 'lg:grid-cols-2' : 'lg:grid-cols-3', className)}>
      {stories.map((story) => (
        <li key={story.id}>{card(story)}</li>
      ))}
    </ul>
  )
}
