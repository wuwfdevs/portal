import { describe, expect, it } from 'vitest'

import { bodyHasContent } from './Component'
import { Text } from './config'

const para = (...children: unknown[]) => ({ type: 'paragraph', children })
const text = (t: string) => ({ type: 'text', text: t })
const doc = (...children: unknown[]) => ({ root: { type: 'root', children } })

describe('bodyHasContent', () => {
  it('is false for an editor that was never typed in', () => {
    for (const v of [null, undefined, {}, 'x', { root: null }, doc(), doc(para()), doc(para(text('  ')), para())]) expect(bodyHasContent(v)).toBe(false)
  })
  it('is true for text, however deep, and for a block with no text', () => {
    expect(bodyHasContent(doc(para(text('Hello'))))).toBe(true)
    expect(bodyHasContent(doc({ type: 'list', children: [{ type: 'listitem', children: [text('one')] }] }))).toBe(true)
    expect(bodyHasContent(doc({ type: 'block', fields: { blockType: 'mediaBlock' } }))).toBe(true)
    expect(bodyHasContent(doc({ type: 'horizontalrule' }))).toBe(true)
  })
})

describe('Text block definition', () => {
  it('has a rich-text body in the Text group', () => {
    expect(Text.admin?.group).toBe('Text')
    const body = Text.fields.find((f) => 'name' in f && f.name === 'body')
    expect(body && 'type' in body ? body.type : null).toBe('richText')
  })
})
