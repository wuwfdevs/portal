import { describe, expect, it } from 'vitest'

import { block, featuredProblems, lexicalProblems, paragraph, root, stableId, text } from './lexical'

describe('stable block ids', () => {
  it('are 24 hex characters, the same for the same input, different otherwise', () => {
    expect(stableId('story', 0)).toMatch(/^[0-9a-f]{24}$/)
    expect(stableId('story', 0)).toBe(stableId('story', 0))
    expect(stableId('story', 0)).not.toBe(stableId('story', 1))
    expect(stableId('story', 0)).not.toBe(stableId('other', 0))
  })
  it('do not collide across a thousand blocks of a thousand stories', () => {
    const seen = new Set<string>()
    for (let s = 0; s < 1000; s++) for (let n = 0; n < 20; n++) seen.add(stableId(`story-${s}`, n))
    expect(seen.size).toBe(20_000)
  })
})

describe('checking converted output before it is saved', () => {
  it('accepts content the editor knows', () => {
    expect(lexicalProblems(root([paragraph([text('hi')]), block('a'.repeat(24), 'embed', {})]))).toEqual([])
  })
  it('flags a block type the story body would silently drop', () => {
    expect(lexicalProblems(root([block('a'.repeat(24), 'promo', {})]))).toEqual(['block type "promo" is not allowed here'])
  })
  it('flags a node the editor does not know', () => {
    expect(lexicalProblems(root([{ type: 'table', version: 1, children: [] }]))).toEqual(['unknown node type "table"'])
  })
  it('allows only a photo, gallery or embed to open a story, and only one', () => {
    expect(featuredProblems([{ id: 'x', blockType: 'gallery' }])).toEqual([])
    expect(featuredProblems([{ id: 'x', blockType: 'pullQuote' }])).toEqual(['featured block "pullQuote" is not allowed'])
    expect(featuredProblems([{ id: 'x', blockType: 'gallery' }, { id: 'y', blockType: 'gallery' }])).toEqual(['more than one featured item'])
  })
})
