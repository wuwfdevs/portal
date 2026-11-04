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
  it('does not depend on the order of a block\'s keys: the database hands them back in its own order (credit before caption)', () => {
    const gallery = (fields: Record<string, unknown>) => oldBody(para(text('Intro.')), { type: 'block', version: 2, fields })
    const written = gallery({ blockType: 'gallery', layout: 'carousel', images: [{ image: 1, caption: 'Nissam family', credit: 'Courtesy photo' }, { image: 2, caption: 'Holender family', credit: 'Courtesy photo' }] })
    const readBack = gallery({ id: 'x', images: [{ id: 'a', image: 1, credit: 'Courtesy photo', caption: 'Nissam family' }, { id: 'b', image: 2, credit: 'Courtesy photo', caption: 'Holender family' }], layout: 'carousel', blockType: 'gallery' })
    expect(visibleWords(readBack)).toBe(visibleWords(written))
    // but the order of the pictures is the reading order, and still counts
    const swapped = gallery({ blockType: 'gallery', images: [{ image: 2, credit: 'Courtesy photo', caption: 'Holender family' }, { image: 1, credit: 'Courtesy photo', caption: 'Nissam family' }] })
    expect(visibleWords(swapped)).not.toBe(visibleWords(written))
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

describe('an empty body', () => {
  const empty = oldBody(para())
  it('is filled when the converter now finds the story\'s words (an episode saved before the converter read its text)', () => {
    expect(planRepair(empty, fresh('<p>Idaho born.</p>'))).toEqual({ kind: 'repair', linkLinesAdded: 0, typedMarkupPieces: 0, filledEmpty: true })
  })
  it('is left alone when the page has no words either, and a body that has words is never "filled"', () => {
    expect(planRepair(empty, oldBody(para()))).toEqual({ kind: 'same' })
    expect(planRepair(oldBody(para(text('Words an editor wrote.'))), fresh('<p>Idaho born.</p>'))).toEqual({ kind: 'same' })
  })
})

describe('the words of blocks other than text and link lines count too', () => {
  const quote = (text: string, attribution = 'A neighbour') => ({ type: 'block', version: 2, fields: { id: 'q1', blockType: 'pullQuote', text, attribution } })
  const pic = (caption: string, extra: Record<string, unknown> = {}) => ({ type: 'block', version: 2, fields: { id: 'm1', blockType: 'mediaBlock', media: 7, caption, ...extra } })
  const withTyped = (...blocks: unknown[]) => oldBody(para(text('Lead.'), link('/x', text('<i>A title</i>'))), ...blocks)
  const freshWith = (...blocks: unknown[]) => ({ root: { type: 'root', version: 1, children: [para(text('Lead.'), { type: 'link', version: 3, fields: { url: '/x' }, children: [{ ...text('A title'), format: 2 }] }), ...blocks] } })
  it('repairs when the pull quote and caption are the same before and after', () => {
    expect(planRepair(withTyped(quote('It is a vote.'), pic('A caption')), freshWith(quote('It is a vote.'), pic('A caption')))).toMatchObject({ kind: 'repair' })
  })
  it('refuses when a pull quote\'s words, a caption, or a removed block would change what a reader reads', () => {
    expect(planRepair(withTyped(quote('It is a vote.')), freshWith(quote('It is not a vote.')))).toEqual({ kind: 'words-differ' })
    expect(planRepair(withTyped(quote('It is a vote.', 'A neighbour')), freshWith(quote('It is a vote.', 'Someone else')))).toEqual({ kind: 'words-differ' })
    expect(planRepair(withTyped(pic('A caption')), freshWith(pic('A different caption')))).toEqual({ kind: 'words-differ' })
    expect(planRepair(withTyped(quote('It is a vote.')), freshWith())).toEqual({ kind: 'words-differ' })
  })
  it('reads captions inside a gallery\'s images, and ignores fields that are not words (ids, settings Payload fills in)', () => {
    const gallery = (caption: string) => ({ type: 'block', version: 2, fields: { id: 'g1', blockType: 'gallery', layout: 'carousel', images: [{ id: 'i1', image: 3, caption }] } })
    expect(planRepair(withTyped(gallery('One')), freshWith(gallery('Two')))).toEqual({ kind: 'words-differ' })
    expect(planRepair(withTyped(pic('Same', { alignment: 'full', enableGutter: true })), freshWith(pic('Same')))).toMatchObject({ kind: 'repair' })
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
