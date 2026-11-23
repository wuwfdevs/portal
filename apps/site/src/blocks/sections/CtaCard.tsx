import React from 'react'

import { SectionHeading as KitHeading } from '@/components/Kit'
import { isTone } from '@/lib/page-themes/themes'
import { cn } from '@/utilities/ui'

import { eyebrowClass, SectionActions } from './parts'
import type { ActionData } from './parts'

/** The tones that are a strong colour of their own; every other tone is the page's ground, so its card is lifted off it with the tone's tint. */
const STRONG: ReadonlySet<string> = new Set(['dark', 'teal', 'lime'])

/**
 * A call to action drawn as a card (Support, Closing band): a rounded panel that carries its own tone, so it reads as one thing to act on, not a second full-width band. The words are on
 * the left and the action beside them when the card is wide (the container's width, not the window's, so a card in a pair stacks them), the action under the words when it is narrow.
 * The band around it is the page's own ground (`CtaBand`), so the editor's tone is the card's colour. Colours are the tone's (`--tone-*`), so the card is right on every tone and theme.
 */
export function CtaCard({ tone, eyebrow, title, intro, note, actions }: { tone: string | null | undefined; eyebrow?: string | null; title: string; intro?: string | null; note?: string | null; actions: ReadonlyArray<ActionData | null | undefined> }) {
  const name = isTone(tone) ? tone : 'plain'
  return (
    // The tone is on an element of its own and the tinted panel inside it: the theme's tone rule (`[data-tone]`) sets the ground and would win over a utility class on the same element.
    <div className="@container h-full">
      <div className="h-full overflow-hidden rounded-4 border [border-color:var(--tone-card-rule)]" data-tone={name}>
        <div className={cn('flex h-full flex-col justify-between gap-8 p-7 md:p-10 @3xl:flex-row @3xl:items-center @3xl:gap-12', !STRONG.has(name) && '[background-color:var(--tone-tint)]')}>
          <div className="flex max-w-2xl flex-col gap-3">
            {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
            {/* No highlight under the words: on a strong colour it would sit behind white text, and a card's title is the one thing it says. */}
            <KitHeading className="text-[color:var(--tone-text)] md:text-[2rem]">
              {title}
            </KitHeading>
            {intro && <p className="text-lg">{intro}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2">
            <SectionActions actions={actions} />
            {note && <p className="text-sm [color:var(--tone-muted)]">{note}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
