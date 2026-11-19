import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { INLINE_SLUGS } from '../inline'
import { SECTION_BLOCKS, blocksOfferedFor, sectionEntry } from '../registry'
import { testContext } from '../testing'
import { ColumnsSection, heldBy } from './Component'

const draw = async (block: Record<string, unknown>) => {
  const out = await ColumnsSection({ block: { blockType: 'sectionColumns', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
const check = (title: string, ...texts: string[]) => ({ blockType: 'sectionCheckList', hidden: false, tone: 'dark', anchor: undefined, listTitle: title, items: texts.map((text) => ({ text })) })

describe('Columns section', () => {
  it('draws nothing when no column holds anything drawable', async () => {
    expect(await draw({})).toBe('')
    expect(await draw({ columns: [{ sections: [] }, { sections: [{ blockType: 'sectionCheckList', hidden: true, items: [{ text: 'x' }] }] }] })).toBe('')
  })
  it('draws each column’s sections without a band of their own, in the Columns block’s band and tone', async () => {
    const out = await draw({ tone: 'grey', anchor: 'two', heading: { title: 'Two things' }, columns: [{ sections: [check('Includes', 'Your name')] }, { sections: [check('Leaves out', 'Prices')] }] })
    expect(out).toContain('data-tone="grey"')
    expect(out).toContain('id="two"')
    expect(out.match(/<section/g)).toHaveLength(1)
    expect(out.match(/data-section="sectionCheckList"/g)).toHaveLength(2)
    for (const s of ['Two things', 'Includes', 'Your name', 'Leaves out', 'Prices']) expect(out).toContain(s)
    expect(out).not.toContain('data-tone="dark"')
  })
  it('uses the layout the variant names, for two columns and for three', async () => {
    const two = [{ sections: [check('A', 'a')] }, { sections: [check('B', 'b')] }]
    expect(await draw({ columns: two })).toContain('lg:grid-cols-2')
    expect(await draw({ variant: 'left-wide', columns: two })).toContain('lg:grid-cols-[2fr_1fr]')
    expect(await draw({ variant: 'right-wide', columns: two })).toContain('lg:grid-cols-[1fr_2fr]')
    expect(await draw({ columns: [...two, { sections: [check('C', 'c')] }] })).toContain('lg:grid-cols-3')
  })
  it('skips a hidden section and never draws a Columns block inside Columns (one level only)', async () => {
    const out = await draw({ columns: [{ sections: [check('Shown', 'x'), { ...check('Hidden', 'y'), hidden: true }, { blockType: 'sectionColumns', columns: [{ sections: [check('Nested', 'z')] }] }] }, { sections: [check('Other', 'w')] }] })
    expect(out).toContain('Shown')
    expect(out).not.toContain('Hidden')
    expect(out).not.toContain('Nested')
  })
  it('drops an empty column rather than leaving a gap', async () => {
    const out = await draw({ columns: [{ sections: [check('A', 'a')] }, { sections: [] }] })
    expect(out).toContain('lg:grid-cols-2')
    expect(out.match(/data-section="sectionCheckList"/g)).toHaveLength(1)
  })
  it('holds a short list of sections that exist, is not offered on a page’s own list for inline-only ones, and cannot hold itself or a hero', () => {
    for (const slug of INLINE_SLUGS) expect(sectionEntry(slug), slug).toBeDefined()
    expect(INLINE_SLUGS as readonly string[]).not.toContain('sectionColumns')
    expect(INLINE_SLUGS as readonly string[]).not.toContain('sectionFeature')
    expect(blocksOfferedFor(null)).toContain('sectionColumns')
    expect(blocksOfferedFor(null)).not.toContain('sectionIllustration')
    expect(SECTION_BLOCKS.find((e) => e.block.slug === 'sectionIllustration')?.inlineOnly).toBe(true)
  })
  it('lists the sections of a column that can be drawn', () => {
    expect(heldBy({ sections: [{ blockType: 'a' }, null, { blockType: 'sectionColumns' }, { blockType: 'b', hidden: true }] })).toEqual([{ blockType: 'a' }])
  })
})
