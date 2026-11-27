import { describe, expect, it } from 'vitest'

import { SECTION_BLOCKS } from '@/blocks/sections/registry'
import { duplicateAnchors } from '@/lib/sections-anchors'

import { HOST_WORDS, HUB_WORDS, LISTENS_HOST_PATH, LISTENS_PATH, listensPages } from './hub-pages'

const pages = listensPages()
const hub = pages.find((p) => p.path === LISTENS_PATH)!
const host = pages.find((p) => p.path === LISTENS_HOST_PATH)!
const text = (v: unknown) => JSON.stringify(v)

describe('the Listens pages as sections', () => {
  it('writes the hub and the host page at their own addresses', () => {
    expect(pages.map((p) => p.path)).toEqual(['/listens', '/listens/host'])
    expect(pages.map((p) => p.slug)).toEqual(['listens', 'listens-host'])
  })
  it('loses no word of the old pages', () => {
    const hubText = text(hub.sections)
    for (const [key, w] of Object.entries(HUB_WORDS)) {
      // The reporters* words are the home page's cards; the hub has a band for every question instead.
      if (key === 'title' || key === 'description' || key.startsWith('reporters')) continue
      expect(hubText, key).toContain(JSON.stringify(w).slice(1, -1))
    }
    const hostText = text(host.sections)
    for (const w of [HOST_WORDS.label, HOST_WORDS.headline, HOST_WORDS.line, HOST_WORDS.back]) expect(hostText).toContain(JSON.stringify(w).slice(1, -1))
  })
  it('uses blocks the listens set is offered, each with a unique id and anchors unique on a page', () => {
    const offered = new Set(SECTION_BLOCKS.filter((e) => !e.sets || e.sets.includes('listens')).map((e) => e.block.slug))
    const ids = new Set<string>()
    for (const p of pages) {
      expect(duplicateAnchors(p.sections as never), p.path).toEqual([])
      for (const s of p.sections) {
        expect(offered.has(s.blockType), `${p.path} ${s.blockType}`).toBe(true)
        expect(ids.has(s.id)).toBe(false)
        ids.add(s.id)
      }
    }
  })
  it('keeps the anchors the hub’s own links point at', () => {
    const anchors = new Set(hub.sections.map((s) => s.anchor))
    for (const a of ['now', 'join-a-session', 'came-of-it']) expect(anchors.has(a), a).toBe(true)
  })
  it('puts the one h1 first on each page, what came of it last, and the form after the host words', () => {
    expect(hub.sections[0]).toMatchObject({ blockType: 'sectionAskWuwf', headline: HUB_WORDS.headline, jumpLinks: false })
    expect(hub.sections.at(-1)).toMatchObject({ blockType: 'sectionListeningOutcomes' })
    expect(host.sections.map((s) => s.blockType)).toEqual(['sectionFeature', 'sectionHostForm'])
  })
  it('gives every section with required fields what it needs to publish', () => {
    for (const s of pages.flatMap((p) => p.sections)) {
      const e = SECTION_BLOCKS.find((x) => x.block.slug === s.blockType)!
      const required = e.block.fields.flatMap((f) => ('name' in f && (f as { required?: boolean }).required && !(f as { admin?: { condition?: unknown } }).admin?.condition ? [f.name as string] : []))
      for (const name of required) {
        if (name === 'tone') continue
        expect(s[name], `${s.id} needs ${name}`).toBeTruthy()
      }
    }
  })
  it('links only back to the hub: the hub has no call to action of its own, because every question carries its own', () => {
    const hrefs = [...hub.sections, ...host.sections].flatMap((s) => ((s.actions as { href: string }[] | undefined) ?? []).map((a) => a.href))
    expect(new Set(hrefs)).toEqual(new Set([LISTENS_PATH]))
  })
})
