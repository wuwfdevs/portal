import Link from 'next/link'
import React from 'react'

import { isTone } from '@/lib/page-themes/themes'
import { isInternalHref, safeHref } from '@/lib/section-links'
import { cn } from '@/utilities/ui'

import { buttonClasses } from './button'
import { eyebrowLabel } from './Eyebrow'
import { headingClasses } from './SectionHeading'

/** The tones that are a strong colour of their own; every other tone is the page's ground, so its card is lifted off it with the tone's tint. */
const STRONG: ReadonlySet<string> = new Set(['dark', 'teal', 'lime'])

export interface CtaAction {
  id?: string | null
  label?: string | null
  href?: string | null
}

/**
 * The call to action: one card for every place the site asks for something (the Support and Closing band sections, the membership appeal on the home and story pages). A rounded panel that
 * carries its own tone, so it reads as one thing to act on. The words come first and the action under them, **left-aligned at every width**: the first action is the filled button, the next an
 * outline, so there is one main thing to press. It is as wide as the place it is put in; the caller sets the width, never the card. Colours are the tone's (`--tone-*`), so it is right on every
 * tone; a tone that is the page's ground is lifted off it with the tone's tint, and a strong colour is left as it is.
 *
 * The tone rules are written under a page theme (`data-page-theme`), which a page of sections has; anywhere else (a story page) wrap the card in an element that sets one, as the membership
 * appeal does. `as` is the title's element: `h2` for a heading, `p` for a sentence that is not one (the appeal); `size` `md` is for such a sentence.
 */
export function CtaCard({
  tone,
  eyebrow,
  title,
  as: Tag = 'h2',
  size = 'lg',
  intro,
  note,
  actions,
  className,
}: {
  tone: string | null | undefined
  eyebrow?: string | null
  title: string
  as?: 'h2' | 'p'
  size?: 'lg' | 'md'
  intro?: string | null
  note?: string | null
  actions: ReadonlyArray<CtaAction | null | undefined>
  className?: string
}) {
  const name = isTone(tone) ? tone : 'plain'
  const buttons = actions.flatMap((a) => {
    const href = safeHref(a?.href)
    const label = a?.label?.trim()
    return href && label ? [{ id: a?.id, href, label }] : []
  })
  return (
    // The tone is on an element of its own and the tinted panel inside it: the theme's tone rule (`[data-tone]`) sets the ground and would win over a utility class on the same element.
    <div className={cn('h-full', className)}>
      <div className="h-full overflow-hidden rounded-4 border [border-color:var(--tone-card-rule)]" data-tone={name}>
        <div className={cn('flex h-full flex-col gap-6 p-7 md:p-10', !STRONG.has(name) && '[background-color:var(--tone-tint)]')}>
          <div className="flex max-w-2xl flex-col gap-3">
            {eyebrow && <p className={cn(eyebrowLabel, '[color:var(--tone-accent)]')}>{eyebrow}</p>}
            {/* No highlight under the words: on a strong colour it would sit behind white text, and a card's title is the one thing it says. */}
            <Tag className={cn(headingClasses(size === 'md' ? 'md' : 'lg'), 'text-[color:var(--tone-text)]', size === 'md' ? 'md:text-2xl md:leading-snug' : 'md:text-[2rem]')}>{title}</Tag>
            {intro && <p className="text-lg">{intro}</p>}
          </div>
          {(buttons.length > 0 || note) && (
            <div className="mt-auto flex flex-col items-start gap-3">
              {buttons.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  {buttons.map((b, i) => {
                    const cls = buttonClasses({ variant: i === 0 ? 'tone' : 'toneOutline' })
                    return isInternalHref(b.href) ? (
                      <Link className={cls} href={b.href} key={b.id ?? `${b.href}-${i}`}>
                        {b.label}
                      </Link>
                    ) : (
                      <a className={cls} href={b.href} key={b.id ?? `${b.href}-${i}`} rel="noopener noreferrer">
                        {b.label}
                      </a>
                    )
                  })}
                </div>
              )}
              {note && <p className="text-sm [color:var(--tone-muted)]">{note}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
