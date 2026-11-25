import React from 'react'

import { SponsorBand, TopUnit } from '@/components/Placements'
import { claimInOrder, planSlots, type ClaimRequest } from '@/lib/page-slots'
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
 *  - **Sponsor slots** (`slots`): the top unit, a row of the rail after every other anchor (`anchor`: a news run or More by section; the first, third, fifth...), and the rows that did not fit in the same band as the last anchor's, never a second band under it. The layout draws
 *    them, not an editor, so they cannot be deleted, hidden or duplicated, and a tile that runs is always drawn. Only for a set that allows placements, and only when
 *    the page's coded route loaded tiles (`context.slots`).
 */
export function RenderSections({ sections, context }: { sections: ReadonlyArray<SectionData | null | undefined> | null | undefined; context: SectionContext }) {
  const drawn = drawnOf(sections)
  const set = pageSetOf(context.setId)
  const ordered = Boolean(set?.dedupe) || Boolean(set?.placements && set.slots && context.slots)
  // Only a page set that asks for the ordered pass or for slots needs the async work; every other page renders synchronously, as it always has.
  if (ordered) return <OrderedSections context={context} drawn={drawn} />
  const runs = ctaRuns(drawn)
  return (
    <>
      {drawn.map(({ block, key, entry }) => {
        if (runs.consumed.has(key)) return null
        const run = runs.starts.get(key)
        if (run) return <CtaGroup context={context} items={run} key={key} />
        const Section = entry.Component
        return <Section block={block} context={context} key={key} />
      })}
    </>
  )
}

/**
 * Call-to-action sections (`cta` in the registry) that follow one another are one band with a card each, side by side on a wide screen and stacked with a gap on a phone, instead of
 * two full-width bands one on top of the other. `starts` maps the first section of each such run (two or more) to the whole run; `consumed` holds the others, which are drawn by the run.
 */
export function ctaRuns(drawn: readonly Drawn[]): { starts: Map<string, Drawn[]>; consumed: Set<string> } {
  const starts = new Map<string, Drawn[]>()
  const consumed = new Set<string>()
  let run: Drawn[] = []
  const close = () => {
    if (run.length >= 2) {
      starts.set(run[0]!.key, run)
      for (const d of run.slice(1)) consumed.add(d.key)
    }
    run = []
  }
  for (const d of drawn) {
    if (d.entry.cta) run.push(d)
    else close()
  }
  close()
  return { starts, consumed }
}

/**
 * One band of call-to-action cards: as many columns as fit at 20rem, so two cards sit side by side on a wide screen and stack with a gap on a phone. Each section draws only its card (`inline`);
 * one that draws nothing (a Support section with no donation address) leaves its cell empty, which is hidden, so the others share the width; with every cell empty the band is hidden too.
 */
export function CtaGroup({ items, context }: { items: readonly Drawn[]; context: SectionContext }) {
  return (
    <section className="hidden py-12 has-[div:not(:empty)]:block md:py-14" data-section="ctaGroup" data-tone="plain">
      <div className="container grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-6 [&>div:empty]:hidden">
        {items.map(({ block, key, entry }) => {
          const Section = entry.Component
          return (
            <div className="min-w-0" key={key}>
              <Section block={{ ...block, inline: true }} context={context} />
            </div>
          )
        })}
      </div>
    </section>
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
      // A block with several parts (More by section: one per column) asks once per part, in order, each under `<key>:<part>`.
      if (Array.isArray(request)) for (const { part, ...r } of request) requests.push({ key: `${key}:${part}`, ...r })
      else if (request) requests.push({ key, ...(request as Omit<ClaimRequest, 'key'>) })
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

  const runs = ctaRuns(drawn)
  const nodes = drawn.map(({ block, key, entry }) => {
    if (runs.consumed.has(key)) return null
    const run = runs.starts.get(key)
    if (run) return <CtaGroup context={ctx} items={run} key={key} />
    const Section = entry.Component
    const rows = plan && entry.anchor ? plan.after[anchorIndex++] : null
    const closesNews = plan && lastAnchor && lastAnchor.key === key
    // Never two bands stacked: rows that had no place join the band after the last anchor (one band, one label, its tiles wrapping into rows).
    const banded = [...(rows ?? []), ...(closesNews ? plan.trailing.flat() : [])]
    return (
      <React.Fragment key={key}>
        <Section block={block} context={entry.drawsTop && key !== topOwner ? withoutTop : ctx} />
        {banded.length > 0 && <SponsorBand items={banded} />}
      </React.Fragment>
    )
  })

  // No news run on the page: every row still shows, after the content.
  const trailing = plan && !lastAnchor && plan.trailing.length > 0 ? <SponsorBand items={plan.trailing.flat()} /> : null

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
