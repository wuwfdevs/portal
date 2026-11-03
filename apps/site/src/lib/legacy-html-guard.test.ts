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

import { changedWidgets, collectWidgets } from './legacy-html-guard'

const widget = (id: string, over: Record<string, unknown> = {}) => ({
  type: 'block',
  fields: { id, blockType: 'widget', title: 'Guide', scriptUrl: 'https://e.example/s.js', elementId: 'g', attributes: [{ name: 'data-a', value: '1' }], height: 600, ...over },
})

describe('changedWidgets', () => {
  it('finds widgets however deep and ignores other blocks', () => {
    expect([...collectWidgets(doc(other('e'), { type: 'list', children: [widget('w')] })).keys()]).toEqual(['w'])
  })
  it('a re-save, or a new title, caption or height, changes nothing', () => {
    const d = doc(widget('w'))
    expect(changedWidgets(d, d)).toEqual([])
    expect(changedWidgets(doc(widget('w', { title: 'New', caption: 'c', height: 900 })), d)).toEqual([])
  })
  it('names a new widget and one whose script, module, id, event or settings differ', () => {
    const d = doc(widget('w'))
    expect(changedWidgets(doc(widget('w'), widget('n')), d)).toEqual(['n'])
    for (const over of [{ scriptUrl: 'https://evil.example/s.js' }, { module: true }, { elementId: 'x' }, { initEvent: 'go' }, { attributes: [{ name: 'data-a', value: '2' }] }]) {
      expect(changedWidgets(doc(widget('w', over)), d)).toEqual(['w'])
    }
  })
  it('treats a first save as everything new', () => {
    expect(changedWidgets(doc(widget('w')), undefined)).toEqual(['w'])
  })
})
