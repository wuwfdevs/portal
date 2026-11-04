// One Grove article page to one story, plus the report. Pure: it reads the page's JSON and nothing else.
//
// What it does not do: fetch, write to the database, or copy files. It leaves a token wherever a library file will
// go (`$asset`) and lists every file in `assets`; the asset pipeline stores them and `resolveAssets` fills the ids in.
// Only WUWF-originated stories are converted: NPR and wire stories are re-pulled from NPR, not migrated as our own.

import { classifyOrigin } from '../census/tally'
import { audioToken, arr, enhancementNodes, leadItems, obj, objectNodes, str, template } from './enhancements'
import { Ctx, absoluteUrl, escapeHtml, plainText, unwrapTemplates } from './context'
import { htmlToNodes } from './html'
import { applyLinkMap } from './links'
import * as lex from './lexical'
import type { ConvertOptions, ConvertResult, ConvertedStory, Json, JsonObject, LexNode, PersonRef, StoryReport } from './types'

const ARTICLE = '/core/article/ArticlePage.hbs'
/** A radio show or podcast episode: a story with audio that belongs to a show. */
const EPISODE = '/media/episode/audio/RadioShowEpisodePage.hbs'
/** A podcast episode (`/podcast/<show>/<date>/<slug>`): the same thing under another template, with its text in `body`. */
const PODCAST_EPISODE = '/media/episode/audio/PodcastEpisodePage.hbs'
const tname = (t: string): string => t.split('/').pop()?.replace(/\.hbs$/, '') ?? t

// ---- the body -------------------------------------------------------------------------------------------------

/** A link that sits between two text chunks, as HTML, so the paragraph around it can be put back together. */
function inlineLinkHtml(l: JsonObject, ctx: Ctx): string {
  const body = unwrapTemplates(str(l.body) ?? '')
  const href = str(l.href)
  if (!body) {
    ctx.note('link.empty-text')
    return ''
  }
  if (!href) {
    ctx.note('link.without-address')
    return escapeHtml(body)
  }
  return `<a href="${escapeHtml(href)}"${str(l.target) === '_blank' ? ' target="_blank"' : ''}>${escapeHtml(body)}</a>`
}

/**
 * Grove's body is a flat run of text chunks (HTML), small link objects that sit in the middle of a sentence, and
 * block objects (a photo, a gallery...). The chunks and links are joined back into one stream of HTML and converted
 * together, so a paragraph that a link interrupted comes out as one paragraph; a block object ends the stream.
 */
export function bodyNodes(body: Json[], ctx: Ctx): LexNode[] {
  const out: LexNode[] = []
  let html = ''
  const flush = () => {
    if (html) out.push(...htmlToNodes(html, ctx))
    html = ''
  }
  // Some chunks come wrapped in an unrendered template call: {{html('<p>...</p>')}}. The wrapper can open in one chunk
  // and close in a later one (a photo sits between), and inside it apostrophes are escaped. Taken in document order.
  let wrapped = false
  const unwrapChunk = (chunk: string): string => {
    let s = chunk
    const open = /^\s*\{\{\s*html\(\s*['"]/.exec(s)
    if (open) {
      s = s.slice(open[0].length)
      wrapped = true
    }
    if (!wrapped) return s
    const close = /['"]\s*\)\s*\}\}\s*$/.exec(s)
    if (close) {
      s = s.slice(0, close.index)
      wrapped = false
    }
    return s.replace(/\\(['"\\])/g, '$1')
  }
  const take = (item: Json): void => {
    if (typeof item === 'string') {
      html += unwrapChunk(item)
      return
    }
    const o = obj(item)
    if (!o) {
      ctx.fail('body.not-an-object')
      return
    }
    const t = template(o)
    if (!t && Array.isArray(o.items)) {
      for (const x of o.items) take(x)
      return
    }
    const name = tname(t)
    if (name === 'InlineEnhancement') {
      for (const x of arr(o.items)) {
        const xo = obj(x)
        const xn = tname(template(xo))
        if (xo && xn === 'Link') html += inlineLinkHtml(xo, ctx)
        else if (xo && xn === 'RichTextHeading') {
          const tag = /^h[1-6]$/.test(str(xo.tag) ?? '') ? str(xo.tag)! : 'h3'
          html += `<${tag}>${str(xo.text) ?? ''}</${tag}>`
        } else ctx.fail('inline.unknown-template', template(x) || 'no template')
      }
      return
    }
    flush()
    if (name === 'Enhancement') out.push(...enhancementNodes(o, ctx))
    else out.push(...objectNodes(o, ctx, 'full'))
  }
  for (const item of body) take(item)
  flush()
  return out
}

/** An episode's show: Grove names it on the page, or the address does (`/show/<slug>/<date>/<slug>`). Never guessed otherwise. */
function showOf(j: JsonObject, path: string, ctx: Ctx): ConvertedStory['show'] {
  let showPath: string | null = null
  try {
    const u = str(j.radioShowUrl) ?? str(j.podcastUrl)
    if (u) showPath = new URL(u).pathname.replace(/\/$/, '')
  } catch {
    /* fall back to the address */
  }
  if (!showPath) {
    const m = /^(\/(?:show|podcast)\/[^/]+)\//.exec(path)
    if (m) {
      showPath = m[1]!
      ctx.note('episode.show-from-address', showPath)
    }
  }
  if (!showPath) {
    ctx.fail('episode.no-show')
    return null
  }
  return { path: showPath, title: plainText(str(j.radioShowTitle) ?? str(j.podcastTitle)).text || null }
}

// ---- who wrote it, where it is filed --------------------------------------------------------------------------

const slugOf = (url: string | undefined, prefix: string): string | undefined => {
  const m = new RegExp(`/${prefix}/([^/?#]+)`).exec(url ?? '')
  return m ? decodeURIComponent(m[1]!) : undefined
}

function bylineOf(j: JsonObject, ctx: Ctx): ConvertedStory['byline'] {
  const people: PersonRef[] = []
  const add = (p: PersonRef) => {
    const dup = people.find((x) => (p.slug && x.slug === p.slug) || x.name.toLowerCase() === p.name.toLowerCase())
    if (!dup) people.push(p)
    else for (const k of ['title', 'bio', 'photo', 'slug'] as const) if (p[k] !== undefined && dup[k] === undefined) (dup as unknown as Record<string, unknown>)[k] = p[k]
  }
  const photoOf = (img: unknown, name: string) => {
    const src = absoluteUrl(str(obj(img)?.src))
    return src ? ctx.asset({ kind: 'image', sourceUrl: src, alt: name }) : undefined
  }
  const authorName = plainText(str(j.authorName)).text
  if (authorName) {
    const bio = plainText(str(j.authorBiography)).text
    const title = plainText(str(j.authorTitle)).text
    const slug = slugOf(str(j.authorUrl), 'people')
    const photo = photoOf(j.authorImage, authorName)
    add({ name: authorName, ...(title ? { title } : {}), ...(slug ? { slug } : {}), ...(bio ? { bio } : {}), ...(photo ? { photo } : {}) })
  }
  for (const c of arr(j.contributingAuthorsInfo)) {
    const o = obj(c)
    const name = plainText(str(o?.authorName)).text
    if (!o || !name) continue
    const title = plainText(str(o.authorTitle)).text
    const slug = slugOf(str(o.authorUrl), 'people')
    const photo = photoOf(o.authorImage, name)
    add({ name, ...(title ? { title } : {}), ...(slug ? { slug } : {}), ...(photo ? { photo } : {}) })
  }
  for (const c of arr(j.contributors)) {
    const o = obj(c)
    const name = plainText(str(o?.body)).text
    if (o && name) add({ name, ...(slugOf(str(o.href), 'people') ? { slug: slugOf(str(o.href), 'people')! } : {}) })
  }
  const bylineText = plainText(str(j.bylineText)).text
  let text: string | null = null
  if (bylineText) {
    if (!people.length) {
      add({ name: bylineText })
      ctx.note('byline.from-text')
    } else if (!people.some((p) => p.name.toLowerCase() === bylineText.toLowerCase())) text = bylineText
  }
  if (!people.length && !text) ctx.note('byline.none')
  if (people.some((p) => !p.slug)) ctx.note('byline.person-without-address', people.filter((p) => !p.slug).map((p) => p.name).join(', '))
  return { people, text }
}

// ---- the whole page -------------------------------------------------------------------------------------------

export function convertStory(page: unknown, options: ConvertOptions = {}): ConvertResult {
  const j = obj(page)
  const canonical = str(j?.canonicalLink)
  const groveId = str(j?.contentId) ?? ''
  let path = ''
  let host: string | null = null
  try {
    const u = new URL(canonical ?? '')
    host = u.hostname
    path = u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : u.pathname
  } catch {
    /* no usable canonical address; reported below */
  }
  const skipped = (reason: 'external' | 'ambiguous' | 'not-an-article', code: string, detail?: string): ConvertResult => {
    const ctx = new Ctx(groveId || 'none')
    ctx.note(code, detail)
    return { status: 'skipped', reason, report: ctx.report(path, groveId) }
  }

  const isPodcast = template(j) === PODCAST_EPISODE
  const isEpisode = template(j) === EPISODE || isPodcast
  if (!j || (template(j) !== ARTICLE && !isEpisode)) return skipped('not-an-article', 'page.not-an-article', template(j) || 'no template')
  // An NPR-distributed show's episodes are NPR's, not WUWF's to archive.
  if (isEpisode && j.nprShow === true) return skipped('external', 'origin.npr-show', str(j.radioShowTitle) ?? str(j.podcastTitle) ?? host ?? 'no host')

  const origin = classifyOrigin({ organization: str(j.sourceOrganizationName) ?? null, canonicalHost: host })
  if (origin === 'external') return skipped('external', 'origin.not-wuwf', `${str(j.sourceOrganizationName) ?? 'unnamed'} / ${host ?? 'no host'}`)
  if (origin === 'ambiguous') return skipped('ambiguous', 'origin.ambiguous', `${str(j.sourceOrganizationName) ?? 'unnamed'} / ${host ?? 'no host'}`)

  const ctx = new Ctx(groveId || path, options.embedHosts ?? [])
  if (!groveId) ctx.fail('story.no-content-id')
  if (!path) ctx.fail('story.no-path')

  const title = plainText(str(j.headline)).text
  if (!title) ctx.fail('story.no-headline')

  const sectionLink = obj(arr(j.primarySection)[0])
  const sectionTitle = plainText(str(sectionLink?.body)).text
  let sectionPath: string | null = null
  try {
    sectionPath = str(sectionLink?.href) ? new URL(str(sectionLink?.href)!, 'https://www.wuwf.org').pathname : null
  } catch {
    sectionPath = null
  }
  const secondary = arr(j.secondarySections).map((s) => plainText(str(obj(s)?.body)).text).filter(Boolean)
  if (secondary.length) ctx.note('sections.secondary-not-migrated', secondary.join(', '))
  if (!sectionTitle) ctx.note('section.none')

  const topics = arr(j.tags).flatMap((t) => {
    const o = obj(t)
    const name = plainText(str(o?.body)).text
    return o && name ? [{ title: name, slug: slugOf(str(o.href), 'tags') ?? null, groveId: str(o.contentId) ?? null }] : []
  })
  if (arr(j.updatesCorrections).length) ctx.fail('story.corrections-not-supported', 'updatesCorrections is present; the story has no field for it')

  const byline = bylineOf(j, ctx)
  // Grove lists WUWF as the source organization of stories that carry a wire service's byline, so the origin check passes them. Whether
  // WUWF may archive that copy is a licensing question for the owner, not for the converter: it is raised, never decided here.
  const wireName = /news service of florida|associated press/i.exec([...byline.people.map((p) => p.name), byline.text ?? ''].join(' | '))?.[0]
  if (wireName) ctx.preserve('origin.wire-byline', wireName)
  // An article keeps its text in `articleBody`; an episode (radio or podcast) keeps it in `body`. Reading the wrong one gave an
  // empty story and no report, which is how the first fifteen episodes lost their text unnoticed.
  const bodyContent = bodyNodes(arr(isEpisode ? j.body : j.articleBody), ctx)
  let content = lex.root(bodyContent)
  if (options.linkMap) {
    // Links to wire stories (which answer 410 here) and to old /post/ addresses (Grove 301s them): point them at the original, or remove them.
    const applied = applyLinkMap(content, options.linkMap)
    content = applied.state
    for (const c of applied.changes) ctx.note(c.to === null ? 'link.unlinked-gone-page' : 'link.repointed', `${c.from} -> ${c.to ?? 'removed'}`)
  }
  const featuredMedia = leadItems(arr(j.lead), ctx)

  let featuredAudio: ConvertedStory['featuredAudio'] = null
  const players = arr(j.audio).map(obj).filter((x): x is JsonObject => !!x)
  if (players.length > 1) ctx.preserve('audio.extra-players-not-kept', String(players.length - 1))
  if (players[0]) featuredAudio = audioToken(players[0], ctx, { title })

  if (isEpisode && !featuredAudio) {
    ctx.note('episode.no-audio')
    // Nothing is lost, but the page would be a title and a description: someone has to attach the audio or decide it goes.
    if (bodyContent.length === 0 && featuredMedia.length === 0) ctx.preserve('episode.hollow-page', 'only the description is kept (as the meta description)')
  }

  const problems = [...lex.lexicalProblems(content), ...lex.featuredProblems(featuredMedia)]
  for (const p of problems) ctx.fail('output.invalid', p)

  const description = plainText(str(j.description)).text
  const story: ConvertedStory = {
    legacy: { groveId, legacyPath: path, modifiedAt: str(j.dateModifiedISO) ?? null },
    path,
    slug: path.split('/').filter(Boolean).pop() ?? '',
    title,
    publishedAt: str(j.datePublishedISO) ?? null,
    description: description || null,
    source: 'wuwf',
    section: sectionTitle ? { title: sectionTitle, path: sectionPath } : null,
    show: isEpisode ? showOf(j, path, ctx) : null,
    format: isEpisode ? 'audio' : 'web',
    topics,
    byline,
    featuredMedia,
    featuredAudio,
    content,
    assets: [...ctx.assets.values()],
  }
  const report: StoryReport = ctx.report(path, groveId)
  return { status: 'converted', story, report }
}
