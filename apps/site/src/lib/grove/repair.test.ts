import { describe, expect, it } from 'vitest'

import { Ctx } from './context'
import { htmlToNodes } from './html'
import { root } from './lexical'
import { countLinkLines, countTypedMarkup, editedSinceImport, planRepair, visibleWords } from './repair'

// What the importer stored before the converter learned these patterns: the paragraphs and typed characters, as plain text.
const oldBody = (...children: unknown[]) => ({ root: { type: 'root', version: 1, children } })
const text = (t: string, format = 0) => ({ type: 'text', version: 1, text: t, format })
const para = (...c: unknown[]) => ({ type: 'paragraph', version: 1, children: c })
const link = (url: string, ...c: unknown[]) => ({ type: 'link', version: 3, fields: { linkType: 'custom', url }, children: c })
const fresh = (html: string) => root(htmlToNodes(html, new Ctx('seed', [])))

const relatedOld = oldBody(
  para(text('Intro.')),
  para(text('RELATED: ', 1), link('/politics/2024-11-14/shocked', text("<b>'I was shocked': Lawmakers react</b>"))),
  para(text('End.')),
)
const relatedFresh = fresh(`<p>Intro.</p><p><b>RELATED: </b><a href="/politics/2024-11-14/shocked">&lt;b&gt;'I was shocked': Lawmakers react&lt;/b&gt;</a></p><p>End.</p>`)

describe('what in a stored body needs repair', () => {
  it('counts typed markup in stored text, and link lines in either body', () => {
    expect(countTypedMarkup(relatedOld)).toBe(1)
    expect(countLinkLines(relatedOld)).toBe(0)
    expect(countLinkLines(relatedFresh)).toBe(1)
    expect(countTypedMarkup(relatedFresh)).toBe(0)
  })
  it('does not count text that merely mentions an opening tag, or holds a typed image or element', () => {
    expect(countTypedMarkup(oldBody(para(text('Use <b> for bold.'))))).toBe(0)
    expect(countTypedMarkup(oldBody(para(text('Look <img src="x"> here </b>'))))).toBe(0)
  })
  it('compares the words a reader would read, ignoring case, punctuation, spacing, typed tags and entities', () => {
    expect(visibleWords(relatedOld)).toBe(visibleWords(relatedFresh))
    expect(visibleWords(oldBody(para(text('A&nbsp;B &gt;&gt;&gt; <i>c</i>'))))).toBe('abc')
    expect(visibleWords(oldBody(para(text('One two'))))).not.toBe(visibleWords(oldBody(para(text('One too')))))
  })
})

describe('planning a repair', () => {
  it('repairs a story whose "RELATED:" line was stored as a paragraph with typed tags, and counts what changes', () => {
    expect(planRepair(relatedOld, relatedFresh)).toEqual({ kind: 'repair', linkLinesAdded: 1, typedMarkupPieces: 1 })
  })
  it('leaves a story that is already current alone', () => {
    expect(planRepair(relatedFresh, relatedFresh)).toEqual({ kind: 'same' })
    expect(planRepair(oldBody(para(text('Plain story.'))), fresh('<p>Plain story.</p>'))).toEqual({ kind: 'same' })
  })
  it('refuses to repair when the words a reader would read would change (the body is then not what the converter made)', () => {
    const edited = oldBody(para(text('Intro, rewritten by an editor.')), relatedOld.root.children[1], para(text('End.')))
    expect(planRepair(edited, relatedFresh)).toEqual({ kind: 'words-differ' })
  })
})

describe('has an editor worked on the story since the import', () => {
  const t0 = '2026-11-03T10:00:00.000Z'
  it('is not edited with one version and a save moments after the import', () => {
    expect(editedSinceImport({ versionCount: 1, createdAt: t0, updatedAt: '2026-11-03T10:00:04.000Z' })).toBe(false)
  })
  it('is edited once there is a second version, or the story changed long after it was made', () => {
    expect(editedSinceImport({ versionCount: 2, createdAt: t0, updatedAt: t0 })).toBe(true)
    expect(editedSinceImport({ versionCount: 1, createdAt: t0, updatedAt: '2026-11-04T10:00:00.000Z' })).toBe(true)
  })
})
