import { describe, expect, it } from 'vitest'

import { reactAttr, toSvgTree, type DomLike } from './svg-tree'

const el = (name: string, attrs: Record<string, string> = {}, children: DomLike[] = []): DomLike => ({
  nodeType: 1,
  localName: name,
  attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  childNodes: children,
})
const text = (t: string): DomLike => ({ nodeType: 3, textContent: t })

describe('toSvgTree', () => {
  it('keeps drawing tags and attributes, and text as text', () => {
    const tree = toSvgTree(el('svg', { width: '10', viewBox: '0 0 10 10' }, [el('g', { fill: 'none' }, [el('text', {}, [text('<b>x</b>')])])]))
    expect(tree).toEqual({ tag: 'svg', attrs: { width: '10', viewBox: '0 0 10 10' }, children: [{ tag: 'g', attrs: { fill: 'none' }, children: [{ tag: 'text', attrs: {}, children: ['<b>x</b>'] }] }] })
  })
  it('drops script, style, foreignObject, image and a link, with everything inside them', () => {
    const tree = toSvgTree(
      el('svg', {}, [el('script', {}, [text('alert(1)')]), el('style', {}, [text('*{}')]), el('foreignObject'), el('image', { href: 'https://x' }), el('a', { href: 'https://x' }), el('circle', { r: '3' })]),
    )
    expect(tree?.children).toEqual([{ tag: 'circle', attrs: { r: '3' }, children: [] }])
  })
  it('drops event handlers, hrefs, and values that could run or fetch', () => {
    const tree = toSvgTree(el('svg', { onload: 'alert(1)', href: 'https://x', fill: 'url(https://evil/x.svg#a)', stroke: 'javascript:alert(1)', 'aria-label': 'ok' }))
    expect(tree?.attrs).toEqual({ 'aria-label': 'ok' })
  })
  it('allows a local url(#id) and puts the prefix on ids and on the references to them, so two drawings never share one', () => {
    const tree = toSvgTree(el('svg', {}, [el('clippath', { id: 'c1' }), el('rect', { 'clip-path': 'url(#c1)' })]), 'v7-')
    expect(tree?.children).toEqual([
      { tag: 'clipPath', attrs: { id: 'v7-c1' }, children: [] },
      { tag: 'rect', attrs: { 'clip-path': 'url(#v7-c1)' }, children: [] },
    ])
  })
  it('keeps only safe inline style properties', () => {
    const tree = toSvgTree(el('svg', { style: 'font-size: 13px; background: url(https://x); overflow: visible; color: red' }))
    expect(tree?.style).toEqual({ fontSize: '13px', overflow: 'visible' })
  })
  it('returns null for a root that is not an svg, and stops on an enormous drawing', () => {
    expect(toSvgTree(el('div'))).toBeNull()
    const many = el('svg', {}, Array.from({ length: 25_000 }, () => el('g')))
    expect(toSvgTree(many)?.children.length ?? 0).toBeLessThan(25_000)
  })
  it('names React props', () => {
    expect(reactAttr('stroke-width')).toBe('strokeWidth')
    expect(reactAttr('class')).toBe('className')
    expect(reactAttr('aria-label')).toBe('aria-label')
    expect(reactAttr('viewBox')).toBe('viewBox')
  })
})
