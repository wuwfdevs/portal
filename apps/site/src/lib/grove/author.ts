// A Grove author page (`/core/author/AuthorPage.hbs`: about 1,148 of them, at `/people/<slug>`) to a contributor profile: the
// name, a short line, a full biography, a portrait and any links. Pure, like the other converters. The page's `main` is the
// list of that person's stories; the site builds that list itself from the stories' bylines, so it is not carried, and that is
// noted. Nothing else is dropped silently.

import { Ctx, absoluteUrl, plainText } from './context'
import { arr, obj, str, template } from './enhancements'
import * as lex from './lexical'
import { bodyNodes } from './story'
import type { AssetRef, AssetToken, Json, LexicalState, LexNode } from './types'

const AUTHOR = '/core/author/AuthorPage.hbs'

export interface ConvertedAuthor {
  legacy: { groveId: string; legacyPath: string }
  /** The exact Grove address, e.g. `/people/rachel-cramer`. */
  path: string
  slug: string
  name: string
  /** One plain line (Grove's `description`), shown under the name. */
  summary: string | null
  biography: LexicalState | null
  portrait: AssetToken | null
  links: { label: string; url: string }[]
  assets: AssetRef[]
}

export type ConvertAuthorResult =
  | { status: 'converted'; author: ConvertedAuthor; report: ReturnType<Ctx['report']> }
  | { status: 'skipped'; reason: 'not-an-author-page'; report: ReturnType<Ctx['report']> }

const withoutSiteSuffix = (t: string): string => t.replace(/\s*\|\s*WUWF\s*$/i, '').trim()

/** A social or web link as Grove lists it. The label is the link's own words, else the host. */
function readLinks(items: Json[], ctx: Ctx): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = []
  for (const it of items) {
    const o = obj(it)
    const href = str(o?.href) ?? str(o?.url)
    let url = ''
    try {
      const u = new URL(href ?? '')
      if (u.protocol === 'https:' || u.protocol === 'http:') url = u.toString()
    } catch {
      /* reported below */
    }
    if (!url) {
      ctx.preserve('author.link-not-mapped', JSON.stringify(it).slice(0, 120))
      continue
    }
    const label = plainText(str(o?.body) ?? str(o?.title)).text || new URL(url).hostname.replace(/^www\./, '')
    out.push({ label, url })
  }
  return out
}

export function convertAuthorPage(raw: unknown): ConvertAuthorResult {
  const j = obj(raw)
  const groveId = str(j?.contentId) ?? ''
  let path = ''
  try {
    path = new URL(str(j?.canonicalLink) ?? '').pathname.replace(/\/$/, '')
  } catch {
    /* reported below */
  }
  if (!j || template(j) !== AUTHOR) {
    const ctx = new Ctx(groveId || 'none')
    ctx.note('page.not-an-author-page', template(j) || 'no template')
    return { status: 'skipped', reason: 'not-an-author-page', report: ctx.report(path, groveId) }
  }

  const ctx = new Ctx(groveId || path)
  if (!groveId) ctx.fail('author.no-content-id')
  const slug = /^\/people\/([^/]+)$/.exec(path)?.[1] ?? ''
  if (!slug) ctx.fail('author.no-address', path || 'no canonical address')

  const name = plainText(str(j.name)).text || withoutSiteSuffix(plainText(str(j.title)).text)
  if (!name) ctx.fail('author.no-name')

  const summary = plainText(str(j.description)).text || null

  const nodes: LexNode[] = bodyNodes(arr(j.fullBiography), ctx)
  for (const p of lex.lexicalProblems(lex.root(nodes))) ctx.fail('output.invalid', p)

  // The portrait: Grove lists images as an array of `Image` modules.
  const img = obj(arr(j.image)[0])
  const src = absoluteUrl(str(obj(img?.image)?.src))
  const portrait = src ? ctx.asset({ kind: 'image', sourceUrl: src, alt: name }) : null
  if (!portrait && arr(j.image).length > 0) ctx.preserve('author.portrait-not-mapped')

  const links = readLinks(arr(j.authorSocialLinks), ctx)

  // The story list is rebuilt from bylines; say so once, so nobody wonders where it went.
  if (arr(j.main).length > 0) ctx.note('author.story-list-rebuilt-from-bylines')

  const author: ConvertedAuthor = {
    legacy: { groveId, legacyPath: path },
    path,
    slug,
    name,
    summary,
    biography: nodes.length > 0 ? lex.root(nodes) : null,
    portrait,
    links,
    assets: [...ctx.assets.values()],
  }
  return { status: 'converted', author, report: ctx.report(path, groveId) }
}
