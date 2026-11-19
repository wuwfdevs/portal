import { describe, expect, it } from 'vitest'

import type { SupportPage } from '@/payload-types'

import { SECTION_BLOCKS } from '@/blocks/sections/registry'
import { duplicateAnchors } from '@/lib/sections-anchors'
import { setNavItems } from '@/lib/page-sets/nav'
import { PAGE_SETS } from '@/lib/page-sets/registry'

import { GIVING_PATHS } from './paths'
import { GIVING_STARTER } from './starter'
import { givingPagesFromGlobal } from './to-sections'
import { groupViews, panelViews } from './content'
import { selectWay } from './ways'
import { LEGACY_GIVING_REDIRECTS } from './legacy-addresses'

const starter = GIVING_STARTER as unknown as SupportPage
const pages = givingPagesFromGlobal(starter)
const all = pages.flatMap((p) => p.sections)
const byPath = (path: string) => pages.find((p) => p.path === path)!

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Every string under a value, with the dotted path it was found at. */
function strings(value: unknown, at = ''): Array<[string, string]> {
  if (typeof value === 'string') return value.trim() ? [[at, norm(value)]] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => (k === 'id' ? [] : strings(v, at ? `${at}.${k}` : k)))
  return []
}

describe('the four giving pages as sections', () => {
  it('are four pages at the four addresses, each with its own slug, in the order of the strip', () => {
    expect(pages.map((p) => p.path)).toEqual([GIVING_PATHS.give, GIVING_PATHS.ways, GIVING_PATHS.legacy, GIVING_PATHS.thanks])
    expect(new Set(pages.map((p) => p.slug)).size).toBe(4)
    const strip = setNavItems(pages.map((p) => ({ title: p.title, path: p.path, navLabel: p.navLabel, navOrder: p.navOrder, noindex: p.noindex })), GIVING_PATHS.give)
    expect(strip.map((i) => [i.label, i.href])).toEqual([
      ['Membership', '/support'],
      ['Leave a legacy', '/support/legacy'],
      ['Other ways to give', '/support/ways'],
    ])
  })
  it('keeps the thank-you page out of the strip and out of search, with no referrer sent on', () => {
    const thanks = byPath(GIVING_PATHS.thanks)
    expect(thanks.noindex).toBe(true)
    expect(thanks.noReferrer).toBe(true)
    expect(pages.filter((p) => p !== thanks).every((p) => !p.noindex && !p.noReferrer)).toBe(true)
  })
  it('use only blocks the giving set is offered, each with a unique id, and anchors unique on a page', () => {
    const offered = new Set(SECTION_BLOCKS.filter((e) => !e.sets || e.sets.includes('giving')).map((e) => e.block.slug))
    for (const p of pages) {
      expect(duplicateAnchors(p.sections as never), p.path).toEqual([])
      for (const s of p.sections) expect(offered.has(s.blockType), `${p.path} ${s.blockType}`).toBe(true)
    }
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
  })
  it('start each page with the one section that carries its headline', () => {
    const first = (path: string) => byPath(path).sections[0]!
    expect(first(GIVING_PATHS.give).blockType).toBe('sectionGiftCard')
    expect(first(GIVING_PATHS.ways).blockType).toBe('sectionWaysToGive')
    expect(first(GIVING_PATHS.legacy)).toMatchObject({ blockType: 'sectionGivingContact', variant: 'hero' })
    expect(first(GIVING_PATHS.thanks).blockType).toBe('sectionThankYou')
    for (const p of pages) expect(p.sections[0]!.headline ?? p.sections[0]!.title, p.path).toBeTruthy()
  })
  it('carry the anchors the contract addresses use', () => {
    const anchors = (path: string) => new Set(byPath(path).sections.map((s) => s.anchor))
    for (const a of ['give', 'levels', 'fellowships']) expect(anchors(GIVING_PATHS.give)).toContain(a)
    expect(anchors(GIVING_PATHS.ways)).toContain('contact')
  })
  it('gives every section with required fields what it needs to publish', () => {
    for (const s of all) {
      const e = SECTION_BLOCKS.find((x) => x.block.slug === s.blockType)!
      const required = e.block.fields.flatMap((f) => ('name' in f && (f as { required?: boolean }).required && !(f as { admin?: { condition?: unknown } }).admin?.condition ? [f.name as string] : []))
      for (const name of required) {
        if (name === 'tone' || s.hidden) continue
        expect(s[name], `${s.id} needs ${name}`).toBeTruthy()
      }
    }
  })
  it('link only to places that exist', () => {
    const ok = (h: unknown) => typeof h === 'string' && (h.startsWith('#') || h.startsWith('https://') || h.startsWith('mailto:') || Object.values(GIVING_PATHS).includes(h.split(/[#?]/)[0] as never) || h.startsWith('/sponsor') || h === '/listen' || h.startsWith('/shows') || h.startsWith('/fellowships') || h.startsWith('/'))
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (k === 'href' || k === 'moreHref' || k === 'linkHref' || k === 'buttonHref' || k === 'secondaryHref' || k === 'promptHref' || k === 'footnoteLinkHref') expect(ok(x), `${k}=${String(x)}`).toBe(true)
          else walk(x)
        }
      }
    }
    walk(all)
  })
  it('open the way to give each old address names (the redirects) in the panel the block will show', () => {
    const block = byPath(GIVING_PATHS.ways).sections[0] as unknown as Parameters<typeof groupViews>[0] & { groups: never; panels: never }
    for (const r of LEGACY_GIVING_REDIRECTS) {
      const asked = new URL(r.destination, 'https://x.invalid').searchParams.get('way')
      if (asked) expect(selectWay(panelViews(block), groupViews(block), asked)?.panel.slug, r.destination).toBe(asked)
    }
  })
  it('lose no word of the old pages: everything an editor typed is on a section or in the navigation', () => {
    const oldPages = { give: starter.give, ways: starter.ways, legacy: starter.legacy, thanks: starter.thanks, nav: starter.nav }
    const there = norm(JSON.stringify([all, pages.map((p) => [p.title, p.navLabel, p.description])]).replace(/\\n/g, ' '))
    // Words that moved to the settings (data, not page words): the broker details' rows (the gift card's amounts are numbers). The strip's label is the
    // set's name now, which the next test holds.
    const moved = /^(ways\.details\.rows|nav\.title)/
    const lost = strings(oldPages)
      .filter(([at]) => !moved.test(at))
      .filter(([, s]) => !there.includes(s))
    expect(lost).toEqual([])
  })
  it('name the set after the strip it replaces', () => {
    expect(PAGE_SETS.giving.name).toBe(starter.nav?.title)
  })
  it('keep the old page switches: a section an editor had switched off stays on the page, hidden', () => {
    const edited = givingPagesFromGlobal({ ...starter, give: { ...starter.give, monthly: { ...starter.give!.monthly, show: false } } } as SupportPage)
    const monthly = edited[0]!.sections.find((s) => s.id.endsWith('-monthly'))!
    expect(monthly.hidden).toBe(true)
    expect(pages[0]!.sections.find((s) => s.id.endsWith('-monthly'))!.hidden).toBe(false)
  })
  it('leave out what has nothing to show (no contact title, no sample quote, no fellowships title)', () => {
    const bare = givingPagesFromGlobal({ ways: { hero: { title: 'Ways' } }, legacy: { hero: { title: 'Legacy' } }, give: { hero: { title: 'Give' } }, thanks: {} } as SupportPage)
    expect(bare[1]!.sections.map((s) => s.blockType)).toEqual(['sectionWaysToGive'])
    expect(bare[2]!.sections.map((s) => s.blockType)).toEqual(['sectionGivingContact'])
    expect(bare[0]!.sections.map((s) => s.blockType)).toEqual(['sectionGiftCard'])
  })
})
