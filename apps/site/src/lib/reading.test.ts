import { describe, expect, it } from 'vitest'

import { lexicalWordCount, readingMinutes } from './reading'

const text = (t: string) => ({ type: 'text', text: t })
const para = (...children: unknown[]) => ({ type: 'paragraph', children })
const doc = (...children: unknown[]) => ({ root: { type: 'root', children } })

describe('lexicalWordCount', () => {
  it('counts words across paragraphs and nested nodes (links, bold)', () => {
    const d = doc(para(text('one two'), { type: 'link', children: [text('three four')] }), para(text('five')))
    expect(lexicalWordCount(d)).toBe(5)
  })
  it('does not count embedded blocks as reading', () => {
    expect(lexicalWordCount(doc(para(text('a b')), { type: 'block', fields: {}, children: [text('hidden words here')] }))).toBe(2)
  })
  it('is 0 for nothing, and for input that is not a document', () => {
    for (const bad of [null, undefined, {}, 'text', { root: null }, doc()]) expect(lexicalWordCount(bad)).toBe(0)
  })
})

describe('readingMinutes', () => {
  it('rounds to whole minutes, at least 1 for any text', () => {
    expect(readingMinutes(doc(para(text('short'))))).toBe(1)
    expect(readingMinutes(doc(para(text(Array(1000).fill('w').join(' ')))))).toBe(5)
    expect(readingMinutes(doc())).toBe(0)
  })
})
