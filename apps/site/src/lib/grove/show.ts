// A Grove radio show page (`/media/show/audio/RadioShowPage.hbs`: "Classical 24", "Acoustic Interlude") to a show: its
// name, schedule, cover picture and description. Pure, like the other converters. Its episodes are separate pages that the
// story converter turns into stories belonging to the show.

import { Ctx, absoluteUrl, plainText } from './context'
import { arr, obj, str, template } from './enhancements'
import * as lex from './lexical'
import { bodyNodes } from './story'
import { readModules } from './page'
import type { AssetRef, AssetToken, LexicalState, StoryReport } from './types'

const SHOW = '/media/show/audio/RadioShowPage.hbs'

export interface ConvertedShow {
  legacy: { groveId: string; legacyPath: string }
  /** The exact Grove address, e.g. `/show/classical-24`. */
  path: string
  slug: string
  title: string
  schedule: string | null
  description: LexicalState | null
  heroImage: AssetToken | null
  assets: AssetRef[]
}

export type ConvertShowResult =
  | { status: 'converted'; show: ConvertedShow; report: StoryReport }
  | { status: 'skipped'; reason: 'not-a-show' | 'external'; report: StoryReport }

export function convertShowPage(raw: unknown): ConvertShowResult {
  const j = obj(raw)
  const groveId = str(j?.contentId) ?? ''
  let path = ''
  try {
    path = new URL(str(j?.canonicalLink) ?? '').pathname.replace(/\/$/, '')
  } catch {
    /* reported below */
  }
  if (!j || template(j) !== SHOW) {
    const ctx = new Ctx(groveId || 'none')
    ctx.note('page.not-a-show', template(j) || 'no template')
    return { status: 'skipped', reason: 'not-a-show', report: ctx.report(path, groveId) }
  }
  if (j.nprShow === true) {
    const ctx = new Ctx(groveId || 'none')
    ctx.note('origin.npr-show', path)
    return { status: 'skipped', reason: 'external', report: ctx.report(path, groveId) }
  }

  const ctx = new Ctx(groveId || path)
  if (!groveId) ctx.fail('show.no-content-id')
  const slug = /^\/show\/([^/]+)$/.exec(path)?.[1] ?? ''
  if (!slug) ctx.fail('show.no-address', path || 'no canonical address')
  const title = (plainText(str(j.headline)).text || plainText(str(j.title)).text.replace(/\s*\|\s*WUWF\s*$/i, '')).trim()
  if (!title) ctx.fail('show.no-title')

  // Grove's `description` on a show is often an internal id, not words: it is not used, and that is said.
  if (/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(str(j.description) ?? '')) ctx.note('show.description-is-an-id')

  const cover = obj(arr(j.coverArt)[0])
  const src = absoluteUrl(str(obj(cover?.image)?.src))
  const heroImage = src ? ctx.asset({ kind: 'image', sourceUrl: src, ...(str(cover?.alt) ? { alt: str(cover!.alt)! } : {}) }) : null
  if (!heroImage && arr(j.coverArt).length > 0) ctx.preserve('show.cover-not-mapped')

  const nodes = [...bodyNodes(arr(j.fullDescription), ctx), ...readModules(arr(j.main), ctx)]
  for (const p of lex.lexicalProblems(lex.root(nodes))) ctx.fail('output.invalid', p)

  const show: ConvertedShow = {
    legacy: { groveId, legacyPath: path },
    path,
    slug,
    title,
    schedule: plainText(str(j.mediaSchedule)).text || null,
    description: nodes.length > 0 ? lex.root(nodes) : null,
    heroImage,
    assets: [...ctx.assets.values()],
  }
  return { status: 'converted', show, report: ctx.report(path, groveId) }
}
