import { describe, expect, it } from 'vitest'

import { contentHash, embeddingText, estimateTokens, lexicalPlainText, skipReason } from './text'
import { MAX_EMBED_CHARS } from './config'

const para = (...texts: string[]) => ({ type: 'paragraph', children: texts.map((text) => ({ type: 'text', text })) })
const doc = (...children: unknown[]) => ({ root: { type: 'root', children } })

describe('lexicalPlainText', () => {
  it('puts a line between paragraphs and joins runs inside one', () => {
    expect(lexicalPlainText(doc(para('Flood ', 'waters', ' rose.'), para('Second.')))).toBe('Flood waters rose.\nSecond.')
  })

  it('skips blocks (pictures, embeds, widgets) and anything nested in them', () => {
    const block = { type: 'block', fields: { caption: 'NOT TEXT' }, children: [{ type: 'text', text: 'hidden' }] }
    expect(lexicalPlainText(doc(para('One.'), block, para('Two.')))).toBe('One.\nTwo.')
  })

  it('reads nested lists and links', () => {
    const list = { type: 'list', children: [{ type: 'listitem', children: [{ type: 'link', children: [{ type: 'text', text: 'Linked' }] }] }] }
    expect(lexicalPlainText(doc(list))).toBe('Linked')
  })

  it('is empty for nothing', () => {
    expect(lexicalPlainText(null)).toBe('')
    expect(lexicalPlainText({})).toBe('')
  })
})

describe('embeddingText', () => {
  it('leads with title, dek and description, then the body', () => {
    const text = embeddingText({ title: 'T', dek: 'D', meta: { description: 'M' }, content: doc(para('Body.')) })
    expect(text).toBe('T\n\nD\n\nM\n\nBody.')
  })

  it('leaves out empty parts', () => {
    expect(embeddingText({ title: 'T', dek: '  ', content: doc(para('Body.')) })).toBe('T\n\nBody.')
  })

  it('never includes the body of a members-only story', () => {
    const text = embeddingText({ title: 'T', dek: 'D', membersOnly: true, content: doc(para('Secret body.')) })
    expect(text).toBe('T\n\nD')
    expect(text).not.toContain('Secret')
  })

  it('cuts a very long story at the limit', () => {
    const long = doc(para('x'.repeat(MAX_EMBED_CHARS * 2)))
    expect(embeddingText({ title: 'T', content: long }).length).toBe(MAX_EMBED_CHARS)
  })
})

describe('skipReason', () => {
  const ok = { title: 'T', _status: 'published', source: 'wuwf', content: doc(para('Body.')) }
  it('accepts a published WUWF story', () => expect(skipReason(ok)).toBeNull())
  it('treats a missing source as WUWF (the field defaults to it)', () => expect(skipReason({ ...ok, source: undefined })).toBeNull())
  it('skips drafts', () => expect(skipReason({ ...ok, _status: 'draft' })).toBe('not-published'))
  it('skips NPR and wire stories', () => {
    expect(skipReason({ ...ok, source: 'npr' })).toBe('not-wuwf')
    expect(skipReason({ ...ok, source: 'wire' })).toBe('not-wuwf')
  })
  it('skips a story with no text at all', () => expect(skipReason({ _status: 'published', source: 'wuwf' })).toBe('no-text'))
})

describe('contentHash', () => {
  it('changes with the text and with the model, and is stable otherwise', () => {
    expect(contentHash('a')).toBe(contentHash('a'))
    expect(contentHash('a')).not.toBe(contentHash('b'))
    expect(contentHash('a', 'model-1')).not.toBe(contentHash('a', 'model-2'))
  })
})

describe('estimateTokens', () => {
  it('is about a quarter of the characters, rounded up', () => expect(estimateTokens('x'.repeat(401))).toBe(101))
})
