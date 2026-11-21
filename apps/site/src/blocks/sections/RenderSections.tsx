import React from 'react'

import { HomeBand, SponsorRow, TopUnit } from '@/components/Placements'
import { claimInOrder, planSlots } from '@/lib/page-slots'
import { pageSetOf } from '@/lib/page-sets/registry'

import { sectionEntry } from './registry'
import type { SectionBlockEntry, SectionContext, SectionData } from './types'

export interface Drawn {
  block: SectionData
  key: string
  entry: SectionBlockEntry
}

/**
 * A page's sections, in order. A section marked hidden, one whose type is not (or no longer) registered, and one with nothing to show draw
 * nothing. Each section is a server component given its own data and the page context, and nothing from the request: a page that holds
 * these stays cached (PAGE-BLOCKS.md → Rendering).
 *
 * Two things a page set can ask of the page (`lib/page-sets/registry.ts`), both done here so no section has to know about the others:
 *  - **No story twice** (`dedupe`): every section that lists stories is asked, in the page's order, which it would show (`claimRequest`), and each is handed the newest
 *    that nothing above it took, as `context.claims`.
 *  - **Sponsor slots** (`slots`): the top unit, a row of the rail above each news run (`anchor`), the rows that did not fit after the last, and the band. The layout draws
 *    them, not an editor, so they cannot be deleted, hidden or duplicated, and a tile that runs is always drawn. Only for a set that allows placements, and only when
 *    the page's coded route loaded tiles (`context.slots`).
 */
export function RenderSections({ sections, context }: { sections: ReadonlyArray<SectionData | null | undefined> | null | undefined; context: SectionContext }) {
  const drawn = drawnOf(sections)
  const set = pageSetOf(context.setId)
  const ordered = Boolean(set?.dedupe) || Boolean(set?.placements && set.slots && context.slots)
  // Only a page set that asks for the ordered pass or for slots needs the async work; every other page renders synchronously, as it always has.
  if (ordered) return <OrderedSections context={context} drawn={drawn} />
  return (
    <>
      {drawn.map(({ block, key, entry }) => {
        const Section = entry.Component
        return <Section block={block} context={context} key={key} />
      })}
    </>
  )
}

const drawnOf = (sections: ReadonlyArray<SectionData | null | undefined> | null | undefined): Drawn[] =>
  (sections ?? []).flatMap((block, index) => {
    if (!block || block.hidden) return []
    const entry = sectionEntry(block.blockType)
    return entry ? [{ block, key: block.id ?? String(index), entry }] : []
  })

/** The page's sections with the ordered pass and the slots (`RenderSections` explains both). */
export async function OrderedSections({ drawn, context }: { drawn: Drawn[]; context: SectionContext }) {
  const set = pageSetOf(context.setId)
  let ctx = context
  if (set?.dedupe && drawn.length > 0) {
    const requests = []
    for (const { block, key, entry } of drawn) {
      const request = entry.claimRequest ? await entry.claimRequest(block, context) : null
      if (request) requests.push({ key, ...request })
    }
    ctx = { ...context, claims: claimInOrder(requests) }
  }

  const slots = set?.placements && set.slots ? context.slots : undefined
  const anchors = drawn.filter((d) => d.entry.anchor)
  const plan = slots ? planSlots(slots, anchors.length) : null
  // A block that lays the top unit out itself (the Front page lead) draws it; the layout places it only when no such block is on the page. Only the FIRST such block is given the
  // tile: a second one (an editor duplicating the block) gets none, so an exclusive placement is never drawn twice.
  const topByBlock = drawn.some((d) => d.entry.drawsTop)
  const topOwner = drawn.find((d) => d.entry.drawsTop)?.key
  const withoutTop: SectionContext = ctx.slots ? { ...ctx, slots: { ...ctx.slots, top: null } } : ctx
  const lastAnchor = anchors[anchors.length - 1]
  let anchorIndex = 0

  const nodes = drawn.map(({ block, key, entry }) => {
    const Section = entry.Component
    const rows = plan && entry.anchor ? plan.before[anchorIndex++] : null
    const closesNews = plan && lastAnchor && lastAnchor.key === key
    return (
      <React.Fragment key={key}>
        {rows && (
          <div className="container py-6">
            <SponsorRow items={rows} />
          </div>
        )}
        <Section block={block} context={entry.drawsTop && key !== topOwner ? withoutTop : ctx} />
        {closesNews && plan.after.map((row, i) => (
          <div className="container py-6" key={`after-${i}`}>
            <SponsorRow items={row} />
          </div>
        ))}
        {closesNews && plan.band && <HomeBand tile={plan.band} />}
      </React.Fragment>
    )
  })

  // No news run on the page: every row still shows, after the content, and the band with them.
  const trailing = plan && !lastAnchor ? (
    <>
      {plan.after.map((row, i) => (
        <div className="container py-6" key={`after-${i}`}>
          <SponsorRow items={row} />
        </div>
      ))}
      {plan.band && <HomeBand tile={plan.band} />}
    </>
  ) : null

  if (!plan?.top || topByBlock || nodes.length === 0) {
    return (
      <>
        {nodes}
        {trailing}
      </>
    )
  }
  // The top unit sits directly under the header on a wide screen and after the first section on a phone (the lead's headline and picture), so a story is always
  // what a phone's first screen shows. One element ordered by the screen, so it is drawn (and counted) once.
  const [first, ...rest] = nodes
  return (
    <div className="flex flex-col">
      <div className="order-1 md:order-2">{first}</div>
      <div className="container order-2 py-6 md:order-1 md:pb-0 md:pt-8">
        <TopUnit tile={plan.top} />
      </div>
      <div className="order-3">
        {rest}
        {trailing}
      </div>
    </div>
  )
}
