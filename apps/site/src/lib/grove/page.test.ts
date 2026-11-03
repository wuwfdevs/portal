import { describe, expect, it } from 'vitest'

import { convertContentPage } from './page'
import type { JsonObject } from './types'

const rich = (...items: unknown[]): JsonObject => ({ _template: '/core/text/RichTextModule.hbs', items: items as never })
const page = (over: JsonObject = {}): JsonObject => ({
  _template: '/core/page/ContentPage.hbs',
  canonicalLink: 'https://www.wuwf.org/bot-june-2017',
  contentId: '00000170-20c2-df2b-ab7b-b2cb3f5900ba',
  title: 'BOT June 2017 | WUWF',
  pageHeading: 'BOT June 2017',
  dateModifiedISO: '2020-05-01T10:00:00Z',
  main: [rich('<p>The board met in June.</p>')],
  ...over,
})
const ok = (p: JsonObject) => {
  const r = convertContentPage(p)
  if (r.status !== 'converted') throw new Error('expected converted')
  return r
}
const types = (r: ReturnType<typeof ok>) => r.page.body.root.children.map((n) => n.type)

describe('convertContentPage', () => {
  it('keeps the exact address, id and modified date, and takes the title without the site suffix', () => {
    const { page: p, report } = ok(page({ pageHeading: '' }))
    expect(p).toMatchObject({ path: '/bot-june-2017', slug: 'bot-june-2017', title: 'BOT June 2017', legacy: { groveId: '00000170-20c2-df2b-ab7b-b2cb3f5900ba', legacyPath: '/bot-june-2017', modifiedAt: '2020-05-01T10:00:00Z' } })
    expect(report.status).toBe('clean')
  })
  it('converts rich-text modules with the story converter, so the same blocks work', () => {
    const r = ok(page({ main: [rich('<p>One.</p>'), rich('<p>Two with <b>bold</b>.</p>')] }))
    expect(types(r)).toEqual(['paragraph', 'paragraph'])
  })
  it('turns a top-level iframe module into an embed block', () => {
    const r = ok(page({ main: [{ _template: '/module/IframeModule.hbs', url: '//player.vimeo.com/video/655373740?h=731f95d8f8', width: '1200', height: '600' }] }))
    expect(r.page.body.root.children[0]!.fields).toMatchObject({ blockType: 'embed' })
  })
  it('uses a plain sub-heading as the lead, and moves one with markup to the top of the body instead of losing it', () => {
    expect(ok(page({ pageSubHeading: '<b>UWF Commencement Ceremonies</b>' })).page.summary).toBe('UWF Commencement Ceremonies')
    const withFrame = ok(page({ pageHeading: '', pageSubHeading: '<b>Ceremony</b><br><div><iframe src="https://player.vimeo.com/video/849251497" width="426" height="240" title="Ceremony"></iframe></div>' }))
    expect(withFrame.page.summary).toBeNull()
    expect(JSON.stringify(withFrame.page.body)).toContain('849251497')
    expect(withFrame.report.entries.map((e) => e.code)).toContain('page.sub-heading-moved-to-body')
  })
  it('reads the contents of a layout container in order and says the layout was flattened', () => {
    const r = ok(page({ main: [{ _template: '/core/container/Container.hbs', rows: [{ _template: '/core/container/TwoColumnContainer.hbs', columns: [rich('<p>Left.</p>'), rich('<p>Right.</p>')] }] }] }))
    expect(types(r)).toEqual(['paragraph', 'paragraph'])
    expect(r.report.entries.map((e) => e.code)).toContain('page.layout-flattened')
  })
  it('flags a module it does not know rather than dropping it silently', () => {
    const r = ok(page({ main: [rich('<p>Kept.</p>'), { _template: '/mystery/Thing.hbs' }] }))
    expect(r.report.status).toBe('review')
    expect(r.report.entries).toContainEqual({ level: 'preserved', code: 'page.module-not-mapped', detail: 'Thing' })
    expect(types(r)).toEqual(['paragraph'])
  })
  it('says so when a page has no body, and refuses a page with no id, address or title', () => {
    expect(ok(page({ main: [] })).report.entries.map((e) => e.code)).toContain('page.empty-body')
    for (const bad of [{ contentId: '' }, { canonicalLink: 'https://www.wuwf.org/' }, { pageHeading: '', title: '' }] as JsonObject[]) expect(convertContentPage(page(bad)).report.status).toBe('exception')
  })
  it('does not convert anything that is not a content page', () => {
    expect(convertContentPage({ _template: '/core/article/ArticlePage.hbs' }).status).toBe('skipped')
  })
})
