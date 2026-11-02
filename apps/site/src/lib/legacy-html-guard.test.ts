import { describe, expect, it } from 'vitest'

import { changedLegacyHtml, collectLegacyHtml } from './legacy-html-guard'

const legacy = (id: string, html: string) => ({ type: 'block', fields: { id, blockType: 'legacyHtml', html } })
const other = (id: string) => ({ type: 'block', fields: { id, blockType: 'embed', url: 'x' } })
const doc = (...children: unknown[]) => ({ root: { type: 'root', children } })

describe('collectLegacyHtml', () => {
  it('finds only preserved-HTML blocks, however deep', () => {
    const d = doc(other('e1'), legacy('a', '<p>1</p>'), { type: 'list', children: [legacy('b', '<p>2</p>')] })
    expect([...collectLegacyHtml(d)]).toEqual([['a', '<p>1</p>'], ['b', '<p>2</p>']])
  })
  it('finds nothing in a state that is not a document', () => {
    for (const v of [null, undefined, {}, 'x', { root: null }]) expect(collectLegacyHtml(v).size).toBe(0)
  })
})

describe('changedLegacyHtml', () => {
  it('a re-save that keeps the existing blocks changes nothing', () => {
    const d = doc(legacy('a', '<p>1</p>'))
    expect(changedLegacyHtml(d, d)).toEqual([])
    expect(changedLegacyHtml(doc(other('e'), legacy('a', '<p>1</p>')), d)).toEqual([])
  })
  it('names a block that is new, and one whose html differs', () => {
    expect(changedLegacyHtml(doc(legacy('a', '<p>1</p>'), legacy('b', '<p>2</p>')), doc(legacy('a', '<p>1</p>')))).toEqual(['b'])
    expect(changedLegacyHtml(doc(legacy('a', '<p>CHANGED</p>')), doc(legacy('a', '<p>1</p>')))).toEqual(['a'])
  })
  it('treats a first save (nothing stored yet) as everything new', () => {
    expect(changedLegacyHtml(doc(legacy('a', '<p>1</p>')), undefined)).toEqual(['a'])
    expect(changedLegacyHtml(doc(other('e')), undefined)).toEqual([])
  })
  it('a removed block is not a change (deleting preserved content is allowed)', () => {
    expect(changedLegacyHtml(doc(), doc(legacy('a', '<p>1</p>')))).toEqual([])
  })
})
