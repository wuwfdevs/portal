// A Grove standard page (`/core/page/ContentPage.hbs`: the "BOT June 2017" and "Election simulator" kind, about 450 on the old
// site) to a page title, a short lead and a body. Pure, like the story converter: nothing is fetched, saved or dropped
// silently. The body is built by the same converter a story's is, so every block a story can hold, a page can too.

import { Ctx, plainText } from './context'
import { embedNode } from './embed'
import { arr, obj, str, template } from './enhancements'
import { htmlToNodes } from './html'
import * as lex from './lexical'
import { bodyNodes } from './story'
import type { AssetRef, Json, JsonObject, LexicalState, LexNode, StoryReport } from './types'

const PAGE = '/core/page/ContentPage.hbs'
const tname = (t: string): string => t.split('/').pop()?.replace(/\.hbs$/, '') ?? t

export interface ConvertedPage {
  legacy: { groveId: string; legacyPath: string; modifiedAt: string | null }
  /** The exact Grove address, e.g. `/bot-june-2017`. Never recomputed. */
  path: string
  slug: string
  title: string
  /** A short plain-text lead, when Grove had one. */
  summary: string | null
  body: LexicalState
  assets: AssetRef[]
}

export type ConvertPageResult =
  | { status: 'converted'; page: ConvertedPage; report: StoryReport }
  | { status: 'skipped'; reason: 'not-a-content-page'; report: StoryReport }

/** Grove puts the site name after the page's title in `title`; the page's own title is what comes before it. */
const withoutSiteSuffix = (t: string): string => t.replace(/\s*\|\s*WUWF\s*$/i, '').trim()

export function convertContentPage(raw: unknown): ConvertPageResult {
  const j = obj(raw)
  const groveId = str(j?.contentId) ?? ''
  let path = ''
  try {
    path = new URL(str(j?.canonicalLink) ?? '').pathname.replace(/\/$/, '')
  } catch {
    /* reported below */
  }
  if (!j || template(j) !== PAGE) {
    const ctx = new Ctx(groveId || 'none')
    ctx.note('page.not-a-content-page', template(j) || 'no template')
    return { status: 'skipped', reason: 'not-a-content-page', report: ctx.report(path, groveId) }
  }

  const ctx = new Ctx(groveId || path)
  if (!groveId) ctx.fail('page.no-content-id')
  if (!path || path === '/') ctx.fail('page.no-address', path || 'no canonical address')

  const title = plainText(str(j.pageHeading)).text || withoutSiteSuffix(plainText(str(j.title)).text)
  if (!title) ctx.fail('page.no-title')

  const nodes: LexNode[] = []

  // The sub-heading is sometimes more than a line of text (a bold caption and a video, say). Plain words become the lead;
  // anything with markup is converted and kept at the top of the body, never thrown away.
  const sub = str(j.pageSubHeading)
  let summary: string | null = null
  if (sub) {
    const { text, hadMarkup } = plainText(sub)
    const simple = !hadMarkup || !/<(iframe|img|a |script|video|audio|table)/i.test(sub)
    if (simple && text.length <= 300) summary = text || null
    else {
      nodes.push(...htmlToNodes(sub, ctx))
      ctx.note('page.sub-heading-moved-to-body')
    }
  }
  if (arr(j.pageLead).length > 0) nodes.push(...bodyNodes(arr(j.pageLead), ctx))

  // The modules, in order. Containers only arrange columns on Grove's page; their contents are read in order.
  const modules = (items: Json[]): void => {
    for (const m of items) {
      const o = obj(m)
      if (!o) continue
      const name = tname(template(o))
      if (name === 'RichTextModule') nodes.push(...bodyNodes(arr(o.items), ctx))
      else if (name === 'IframeModule') {
        const num = (v: Json | undefined): number | undefined => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : undefined)
        const e = embedNode(str(o.url) ?? '', ctx, { width: num(o.width), height: num(o.height) })
        if (e) nodes.push(e)
      }
      else if (/Container$/.test(name)) {
        ctx.note('page.layout-flattened', name)
        modules(Object.values(o).flatMap((v) => (Array.isArray(v) ? v : obj(v) ? [v] : [])) as Json[])
      } else ctx.preserve('page.module-not-mapped', name || 'no template')
    }
  }
  modules(arr(j.main))

  for (const p of lex.lexicalProblems(lex.root(nodes))) ctx.fail('output.invalid', p)
  if (nodes.length === 0) ctx.note('page.empty-body')

  const page: ConvertedPage = {
    legacy: { groveId, legacyPath: path, modifiedAt: str(j.dateModifiedISO) ?? null },
    path,
    slug: path.split('/').filter(Boolean).pop() ?? '',
    title,
    summary,
    body: lex.root(nodes),
    assets: [...ctx.assets.values()],
  }
  return { status: 'converted', page, report: ctx.report(path, groveId) }
}

/** Exposed for tests of what a converter run should see. */
export type { JsonObject }
