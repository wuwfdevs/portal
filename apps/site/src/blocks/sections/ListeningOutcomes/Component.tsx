import React from 'react'

import { answeredBy, outcomeDate, outcomeKicker } from '@/lib/listening/hub'
import type { HubLoad } from '@/lib/listening/load'
import { safeHref } from '@/lib/section-links'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export type ListeningOutcomesData = SectionData

const card = 'flex h-full flex-col gap-3.5 rounded-lg border p-6 [background:var(--tone-card)] [border-color:var(--tone-card-rule)] hover:no-underline'

/** Outcomes. A pure view over what the Portal answered, so it is tested with fixtures. */
export function ListeningOutcomesView({ block, load }: { block: ListeningOutcomesData; load: HubLoad | undefined }) {
  if (!load || load.kind !== 'ok' || load.hub.answered.length === 0) return null
  return (
    <SectionBand block={block} heading={block.heading}>
      <ul className="grid list-none gap-5 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        {load.hub.answered.map((item) => {
          const outcome = item.outcomes[0]
          if (!outcome) return null
          const who = answeredBy(item.responseCount)
          const date = outcomeDate(outcome.publishedAt)
          const href = safeHref(outcome.url)
          const body = (
            <>
              <span className="font-serif text-xl italic leading-snug">“{item.title}”</span>
              {who && <span className="text-[0.8125rem] [color:var(--tone-muted)]">{who}</span>}
              <span className="flex flex-col gap-1 border-t pt-3.5 [border-color:var(--tone-card-rule)]">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] [color:var(--tone-accent)]">{outcomeKicker(outcome, item.contextLabel)}</span>
                <strong className="text-[1.1875rem] leading-snug">{outcome.title}</strong>
              </span>
              {(outcome.summary || date) && <span className="text-sm [color:var(--tone-muted)]">{outcome.summary ?? date}</span>}
            </>
          )
          return <li key={item.publicId}>{href ? <a className={card} href={href} rel="noopener">{body}</a> : <div className={card}>{body}</div>}</li>
        })}
      </ul>
    </SectionBand>
  )
}

/** Outcomes. Draws nothing without the hub, or with nothing that came of a question yet. */
export function ListeningOutcomesSection({ block, context }: SectionProps<ListeningOutcomesData>) {
  return <ListeningOutcomesView block={block} load={context.listeningHub} />
}
