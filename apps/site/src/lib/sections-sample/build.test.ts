import { describe, expect, it } from 'vitest'

import { SECTION_BLOCKS } from '@/blocks/sections/registry'
import { TONES } from '@/lib/page-themes/themes'
import { isValidAnchor } from '@/lib/sections-anchors'

import { SAMPLES, buildSampleSections } from './build'

const refs = { mediaIds: [11, 12, 13], postId: 5, sectionId: 2, topicId: 3, productionId: 4, fellowshipId: 6, now: new Date('2026-12-01T12:00:00Z') }
const sections = buildSampleSections(refs)

describe('the sample page', () => {
  it('has a sample for every block in the library, and for nothing else', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(SECTION_BLOCKS.map((e) => e.block.slug).sort())
  })
  it('leaves out the set-only blocks (the page is in no set, which would refuse them), and uses every library block in every tone, once each', () => {
    const library = SECTION_BLOCKS.filter((e) => !e.sets && !e.inlineOnly)
    expect(library.length).toBeLessThan(SECTION_BLOCKS.length)
    expect(sections).toHaveLength(library.length * TONES.length)
    expect(sections.some((s) => SECTION_BLOCKS.find((e) => e.block.slug === s.blockType)?.sets)).toBe(false)
    for (const e of library) {
      const mine = sections.filter((s) => s.blockType === e.block.slug)
      expect(mine.map((s) => s.tone), e.block.slug).toEqual([...TONES])
    }
  })
  it('shows every variant of every library block at least once', () => {
    for (const e of SECTION_BLOCKS.filter((x) => !x.sets && !x.inlineOnly)) {
      const f = e.block.fields.find((x) => 'name' in x && x.name === 'variant') as { options?: Array<{ value: string }> } | undefined
      if (!f?.options) continue
      const shown = new Set(sections.filter((s) => s.blockType === e.block.slug).map((s) => s.variant))
      for (const o of f.options) expect(shown.has(o.value), `${e.block.slug} ${o.value}`).toBe(true)
    }
  })
  it('gives every section a unique id and a valid, unique anchor, and none is hidden', () => {
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length)
    expect(new Set(sections.map((s) => s.anchor)).size).toBe(sections.length)
    for (const s of sections) {
      expect(isValidAnchor(s.anchor), s.anchor).toBe(true)
      expect(s.hidden).toBe(false)
    }
  })
  it('refers only to the records it was given, and to none when it was given none', () => {
    const none = buildSampleSections({ mediaIds: [], now: refs.now })
    const flat = JSON.stringify(none)
    expect(flat).not.toMatch(/"(image|photo)":\d/)
    expect(none.find((s) => s.blockType === 'sectionCredit')?.target).toBeUndefined()
    expect(none.find((s) => s.blockType === 'sectionFeaturedRecord')?.record).toBeUndefined()
    expect(JSON.stringify(sections)).toContain('"relationTo":"posts","value":5')
  })
  it('sets typed dates relative to the day it was made, with one already past', () => {
    const dates = sections.find((s) => s.blockType === 'sectionDates')!.items as Array<{ startsAt: string }>
    const starts = dates.map((d) => Date.parse(d.startsAt))
    expect(starts.filter((t) => t > refs.now.getTime()).length).toBe(3)
    expect(starts.filter((t) => t < refs.now.getTime()).length).toBe(1)
  })
})
