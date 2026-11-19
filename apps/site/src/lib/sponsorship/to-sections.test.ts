import { describe, expect, it } from 'vitest'

import type { Sponsorship } from '@/payload-types'

import { SECTION_BLOCKS } from '@/blocks/sections/registry'
import { PAGE_SETS } from '@/lib/page-sets/registry'
import { INLINE_SLUGS } from '@/blocks/sections/inline'
import { duplicateAnchors } from '@/lib/sections-anchors'

import { SPONSOR_PATHS } from './paths'
import { SPONSORSHIP_STARTER as STARTER } from './starter'
import { sponsorPagesFromGlobal, type SectionDoc } from './to-sections'

// The programs live in their own rows (an earlier migration seeds them); the open ones become the last goal on the hub.
const starter = {
  ...STARTER,
  programs: [{ id: 'p1', name: 'RadioLive', kind: 'live-series', status: 'open', description: 'Every month, WUWF puts live musicians on stage. A partnership puts your name alongside live music.', levels: [{ name: 'Presenting partner', price: null }] }],
} as unknown as Sponsorship
const pages = sponsorPagesFromGlobal(starter)
const all = pages.flatMap((p) => p.sections)

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Every string under a value, with the dotted path it was found at. */
function strings(value: unknown, at = ''): Array<[string, string]> {
  if (typeof value === 'string') return value.trim() ? [[at, norm(value)]] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => (k === 'id' ? [] : strings(v, at ? `${at}.${k}` : k)))
  return []
}

describe('the six sponsorship pages as sections', () => {
  it('are six pages at the six addresses, in the sponsor set’s order, each with its own slug', () => {
    expect(pages.map((p) => p.path)).toEqual(Object.values(SPONSOR_PATHS))
    expect(pages.map((p) => p.navOrder)).toEqual([1, 2, 3, 4, 5, 6])
    expect(new Set(pages.map((p) => p.slug)).size).toBe(6)
    expect(pages.map((p) => p.navLabel)).toEqual(['Sponsor WUWF', 'On air', 'Digital', 'Events and programs', 'Audience', 'Credit guidelines'])
    expect(PAGE_SETS.sponsor.name).toBeTruthy()
  })
  it('use only blocks the sponsor set is offered, each with a unique id, and anchors unique on a page', () => {
    const offered = new Set(SECTION_BLOCKS.filter((e) => !e.sets || e.sets.includes('sponsor')).map((e) => e.block.slug))
    for (const p of pages) {
      expect(duplicateAnchors(p.sections as never), p.path).toEqual([])
      for (const s of p.sections) expect(offered.has(s.blockType), `${p.path} ${s.blockType}`).toBe(true)
    }
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
  })
  it('start each page with one hero that has a headline, and carry the contract anchors', () => {
    for (const p of pages) {
      const first = p.sections[0]!
      expect(first.blockType, p.path).toBe('sectionFeature')
      expect(first.headline, p.path).toBeTruthy()
      expect(p.sections.filter((s) => s.blockType === 'sectionFeature' && s.variant === 'hero')).toHaveLength(1)
    }
    const anchors = (path: string) => new Set(pages.find((p) => p.path === path)!.sections.map((s) => s.anchor))
    expect(anchors('/sponsor')).toContain('inquire')
    expect(anchors('/sponsor')).toContain('places')
    for (const a of ['rates', 'carpool', 'programs', 'packages']) expect(anchors('/sponsor/on-air')).toContain(a)
  })
  it('gives every block with required fields what it needs to publish', () => {
    for (const s of all) {
      const e = SECTION_BLOCKS.find((x) => x.block.slug === s.blockType)!
      const required = e.block.fields.flatMap((f) => ('name' in f && (f as { required?: boolean }).required && !(f as { admin?: { condition?: unknown } }).admin?.condition ? [f.name as string] : []))
      for (const name of required) {
        if (name === 'tone') continue
        if (s.hidden) continue
        expect(s[name], `${s.id} needs ${name}`).toBeTruthy()
      }
    }
  })
  it('links only to places that exist', () => {
    const ok = (h: unknown) => typeof h === 'string' && (h.startsWith('#') || h === '/sponsor#inquire' || Object.values(SPONSOR_PATHS).includes(h.split('#')[0] as never) || h.startsWith('https://'))
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (k === 'href' || k === 'moreHref' || k === 'linkHref') expect(ok(x), `${k}=${String(x)}`).toBe(true)
          else walk(x)
        }
      }
    }
    walk(all)
  })
  it('lose no word of the old pages: everything an editor typed is on a section', () => {
    const oldPages = { hub: starter.hub, onAir: starter.onAir, digital: starter.digital, events: starter.events, audience: starter.audience, guidelines: starter.guidelines }
    const there = norm(JSON.stringify(all.map((s) => s as SectionDoc)).replace(/\\n/g, ' '))
    // Words that moved to the settings (data, not page words), the form's server messages, and the two things that cannot be drawn by a block.
    const moved = /^(onAir\.rates\.(dayparts|creditCounts)|onAir\.packages\.items|events\.programs)/
    const lost = strings(oldPages)
      .filter(([at]) => !moved.test(at))
      .filter(([at]) => !/\.page$/.test(at)) // a select's value (which page a card goes to), not a word
      .filter(([at]) => at !== 'audience.sectors.talkLabel') // a template: "Talk to us about {short}" is drawn once for each sector, with its name filled in
      .filter(([at, s]) => !there.includes(s) && !hubInquiryServerMessage(at))
      .map(([at, s]) => `${at}: ${s.slice(0, 80)}`)
    expect(lost).toEqual(KNOWN_LOSSES)
  })
  it('hides what the editors had switched off, and keeps its words', () => {
    const g = JSON.parse(JSON.stringify(starter)) as Sponsorship
    g.hub!.faq!.show = false
    const faq = sponsorPagesFromGlobal(g)[0]!.sections.find((s) => s.id === 'sponsor-faq')!
    expect(faq.hidden).toBe(true)
    expect(JSON.stringify(faq)).toContain((g.hub!.faq!.items![0]!.question as string).slice(0, 20))
  })
  it('opens the hub on the tinted band, with its four figures and their source in a row below', () => {
    const [hero, figures] = pages[0]!.sections
    expect(hero!.tone).toBe('accent')
    expect(figures!.blockType).toBe('sectionStats')
    expect((figures!.stats as unknown[]).length).toBe(4)
    expect(figures!.source).toBeTruthy()
  })
  it('draws the digital page’s three placement tables beside their illustrations, and the guidelines’ two lists in Columns', () => {
    const digital = pages.find((p) => p.path === '/sponsor/digital')!.sections.filter((s) => s.blockType === 'sectionColumns')
    expect(digital).toHaveLength(3)
    for (const c of digital) {
      const held = (c.columns as Array<{ sections: Array<{ blockType: string }> }>).flatMap((col) => col.sections.map((x) => x.blockType))
      expect(held).toContain('sectionIllustration')
      expect(held).toContain('sectionTable')
    }
    const guidelines = pages.find((p) => p.path === '/sponsor/credit-guidelines')!.sections.find((s) => s.id.endsWith('includes'))!
    expect(guidelines.blockType).toBe('sectionColumns')
    const lists = (guidelines.columns as Array<{ sections: Array<{ blockType: string; mark: string }> }>).map((col) => col.sections[0]!)
    expect(lists.map((l) => l.mark)).toEqual(['check', 'cross'])
  })
  it('holds only sections a Columns block may hold, and never a Columns block', () => {
    for (const s of all.filter((x) => x.blockType === 'sectionColumns')) {
      for (const col of s.columns as Array<{ sections: Array<{ blockType: string }> }>) for (const h of col.sections) expect(INLINE_SLUGS as readonly string[], h.blockType).toContain(h.blockType)
    }
  })
})

/** The server messages of the form belong to the settings (the action reads them), not to a section. */
const hubInquiryServerMessage = (at: string): boolean => /^hub\.inquiry\.(notSetUpMessage|failedMessage)$/.test(at)

/** Old words with no place on the new pages, said plainly here so the owner can see them. */
const KNOWN_LOSSES: string[] = []
