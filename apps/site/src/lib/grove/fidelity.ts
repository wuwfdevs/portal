// An independent check that a converted story still holds what its Grove page held. Pure: it reads a raw Grove page and the story the
// converter made from it, and says what is missing.
//
// Why it exists: the converter's own report counts statuses ("clean", "review"), and a status cannot show that text arrived. Episodes
// kept their text in `body` while the converter read `articleBody`; every episode converted "clean" with no words at all. This check reads
// the page WITHOUT the converter's code, with its own small text extraction, so a converter that reads the wrong field, drops a paragraph
// or loses a picture is caught by something that does not share its mistakes.
//
// It checks what a reader would miss: the words of the body (paragraph by paragraph), every picture and audio file, and the identity
// fields (path, Grove id, title, publish date). Links are advisory. It does not judge formatting.

import type { ConvertedStory } from './types'

type Json = unknown

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
}
const decode = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)

/** Grove leaves `{{html('...')}}` wrappers in some text. Removed here the plain way, not with the converter's code. */
const unwrap = (s: string): string => s.replace(/\{\{\s*html\(\s*['"]/g, '').replace(/['"]\s*\)\s*\}\}/g, '').replace(/\\(['"\\])/g, '$1')

/** The text of a piece of HTML, with a newline where a block ends. Scripts and styles are not text. */
export function htmlText(html: string): string {
  const noCode = unwrap(html).replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
  const broken = noCode.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h[1-6]|div|blockquote|tr|ul|ol)>/gi, '\n')
  // Twice: markup typed as words (`&lt;i&gt;Title&lt;/i&gt;`) is only a tag once the entities are decoded.
  return decode(decode(broken.replace(/<[^>]*>/g, '')).replace(/<\/?[a-zA-Z][^>]*>/g, ''))
}

/** Lower-case letters and digits only: two texts that read the same squash to the same string. */
export const squash = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const wordsOf = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean)

const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: Json): string => (typeof v === 'string' ? v : '')
const SITE = 'https://www.wuwf.org'
const absolute = (u: string): string => (u.startsWith('//') ? `https:${u}` : u.startsWith('/') ? `${SITE}${u}` : u)

export interface SourceFacts {
  path: string | null
  groveId: string | null
  title: string
  publishedAt: string | null
  /** The body as a reader would read it: paragraphs and list items, one per line. */
  text: string
  imageUrls: string[]
  /** One entry per audio player on the page: the addresses it offers (any one of them being kept is enough). */
  audioPlayers: string[][]
  hrefs: string[]
}

/** The body lives under `articleBody` on an article and under `body` on an episode. Both are read, so neither mistake can hide the other. */
const BODY_KEYS = ['articleBody', 'body']

export function sourceFactsOf(page: Json): SourceFacts {
  const j = isObj(page) ? page : {}
  let path: string | null = null
  try {
    const u = new URL(str(j.canonicalLink))
    path = u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : u.pathname
  } catch {
    path = null
  }
  const imageUrls = new Set<string>()
  const hrefs = new Set<string>()
  const audioPlayers: string[][] = []
  let text = ''

  const takeHtmlLinksAndImages = (html: string) => {
    const clean = unwrap(html).replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    for (const m of clean.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) if (/^(https?:)?\/\//i.test(m[1]!) || m[1]!.startsWith('/')) imageUrls.add(absolute(m[1]!))
    for (const m of clean.matchAll(/<a\b[^>]*?\bhref=["']([^"']+)["']/gi)) hrefs.add(m[1]!)
  }

  // A `<noscript>` fallback can open in one chunk, hold a link object in the next, and close in a third. What is inside it is not text a
  // reader reads (the converter removes it, and says so), so it is skipped across chunks, not only inside one string.
  let inNoscript = false

  /** Walk a body: text pieces in order, links inline, a block object ends the line. */
  const walk = (v: Json): void => {
    if (typeof v === 'string') {
      for (const part of v.split(/(<noscript\b[^>]*>|<\/noscript>)/i)) {
        if (/^<noscript/i.test(part)) inNoscript = true
        else if (/^<\/noscript>/i.test(part)) inNoscript = false
        else if (!inNoscript) {
          takeHtmlLinksAndImages(part)
          text += htmlText(part)
        }
      }
      return
    }
    if (inNoscript) return
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (!isObj(v)) return
    const tpl = str(v._template)
    // An inline enhancement sits INSIDE a paragraph: a link, or a heading that ends the line around it. It is not a block boundary.
    if (/\/InlineEnhancement\.hbs$/.test(tpl)) {
      for (const it of Array.isArray(v.items) ? v.items : []) {
        if (isObj(it) && typeof it.tag === 'string' && typeof it.text === 'string') text += `\n${htmlText(it.text)}\n`
        else walk(it)
      }
      return
    }
    if (/\/Link\.hbs$/.test(tpl)) {
      text += htmlText(str(v.body))
      if (str(v.href)) hrefs.add(str(v.href))
      return
    }
    if (Array.isArray(v.sources)) {
      audioPlayers.push((v.sources as Json[]).map((s) => (isObj(s) ? absolute(str(s.src)) : '')).filter(Boolean))
      return
    }
    // A rich-text chunk (`{ items: [...] }`, no template) is only a container: the sentence goes on across chunks and inline links.
    if (!tpl && Array.isArray(v.items)) {
      walk(v.items)
      return
    }
    text += '\n'
    if (isObj(v.image) && typeof v.image.src === 'string') imageUrls.add(absolute(v.image.src))
    if (typeof v.tag === 'string' && typeof v.text === 'string') text += `${htmlText(v.text)}\n` // a heading inside a paragraph
    if (typeof v.quote === 'string') text += `${htmlText(v.quote)}\n`
    if (typeof v.attribution === 'string') text += `${htmlText(v.attribution)}\n`
    for (const k of ['items', 'item', 'content', 'player']) if (k in v) walk(v[k])
    text += '\n'
  }

  for (const k of BODY_KEYS) if (k in j) walk(j[k])

  // The lead (a photo, or a carousel of them) and the page's own audio: outside the body, inside the story.
  const collectImages = (v: Json): void => {
    if (Array.isArray(v)) v.forEach(collectImages)
    else if (isObj(v)) {
      if (isObj(v.image) && typeof v.image.src === 'string') imageUrls.add(absolute(v.image.src))
      for (const [k, x] of Object.entries(v)) if (k !== 'narrowImage' && k !== 'thumbnail' && k !== 'poster') collectImages(x)
    }
  }
  collectImages(j.lead)
  for (const p of Array.isArray(j.audio) ? j.audio : []) {
    if (isObj(p) && Array.isArray(p.sources)) audioPlayers.push((p.sources as Json[]).map((s) => (isObj(s) ? absolute(str(s.src)) : '')).filter(Boolean))
  }

  return {
    path,
    groveId: str(j.contentId) || null,
    title: htmlText(str(j.headline)).trim(),
    publishedAt: str(j.datePublishedISO) || null,
    text,
    imageUrls: [...imageUrls].filter((u) => /^https?:\/\//i.test(u)),
    audioPlayers: audioPlayers.filter((p) => p.length > 0),
    hrefs: [...hrefs],
  }
}

type LexNode = { type?: string; text?: unknown; fields?: Record<string, unknown>; children?: LexNode[] }

/** What a reader of the converted story reads, in the same terms: text nodes, link lines, pull quotes and preserved tables, in order. */
export function convertedText(story: Pick<ConvertedStory, 'content'>): { text: string; urls: string[] } {
  let text = ''
  const urls: string[] = []
  const go = (n: LexNode): void => {
    if (n.type === 'text' && typeof n.text === 'string') text += n.text
    else if (n.type === 'linebreak') text += '\n'
    else if (n.type === 'link' && typeof n.fields?.url === 'string') urls.push(n.fields.url)
    else if (n.type === 'block') {
      const f = n.fields ?? {}
      text += '\n'
      if (f.blockType === 'linkLine') {
        text += `${str(f.label)} ${str(f.linkText)}\n`
        if (typeof f.url === 'string') urls.push(f.url)
      } else if (f.blockType === 'pullQuote') text += `${str(f.text)}\n${str(f.attribution)}\n`
      else if (f.blockType === 'legacyHtml') text += `${htmlText(str(f.html))}\n`
      else if (f.blockType === 'embed' && typeof f.url === 'string') urls.push(f.url)
    }
    for (const c of n.children ?? []) go(c)
    if (['paragraph', 'heading', 'listitem', 'quote'].includes(n.type ?? '')) text += '\n'
  }
  go((story.content as unknown as { root: LexNode }).root)
  return { text, urls }
}

export type FidelityLevel = 'pass' | 'warn' | 'fail'
export interface FidelityProblem {
  code: string
  level: 'warn' | 'fail'
  detail: string
}
export interface FidelityResult {
  path: string
  level: FidelityLevel
  problems: FidelityProblem[]
  sourceWords: number
  storyWords: number
  sourceImages: number
  paragraphsMissing: number
}

/** The shortest paragraph (in words) whose absence counts as a loss. Shorter lines are labels and dates; their loss shows in the word count. */
const MIN_PARAGRAPH_WORDS = 6
/** Of the source's words, how many the story may be short of before it is called a loss. */
const MIN_WORD_RATIO = 0.97

const noQuery = (u: string): string => u.replace(/\?.*$/, '')
/** Addresses the converter changes on purpose (owner decisions), so a changed link is not a lost one. */
const INTENDED_REWRITES: Record<string, string> = { '/thanks-for-your-support': '/support' }
const linkKey = (h: string): string => {
  try {
    const u = new URL(/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(h) ? `https://${h}` : h, SITE)
    const own = u.pathname.replace(/\/$/, '')
    return /(^|\.)wuwf\.org$/.test(u.hostname) ? (INTENDED_REWRITES[own] ?? own) : `${u.host}${own}`
  } catch {
    return h
  }
}

export function compareFidelity(source: SourceFacts, story: Pick<ConvertedStory, 'path' | 'title' | 'publishedAt' | 'legacy' | 'content' | 'assets' | 'featuredAudio'>): FidelityResult {
  const problems: FidelityProblem[] = []
  const fail = (code: string, detail: string) => problems.push({ code, level: 'fail', detail })
  const warn = (code: string, detail: string) => problems.push({ code, level: 'warn', detail })

  // Identity: the fields a reader, a search engine and a re-run all depend on.
  if (source.path !== story.path) fail('identity.path', `${source.path} -> ${story.path}`)
  if (source.groveId !== story.legacy.groveId) fail('identity.grove-id', `${source.groveId} -> ${story.legacy.groveId}`)
  if (squash(source.title) !== squash(story.title)) fail('identity.title', `"${source.title.slice(0, 60)}" -> "${story.title.slice(0, 60)}"`)
  if ((source.publishedAt ?? null) !== (story.publishedAt ?? null)) fail('identity.published-at', `${source.publishedAt} -> ${story.publishedAt}`)

  // The body, paragraph by paragraph.
  const conv = convertedText(story)
  const convSquash = squash(conv.text)
  const paragraphs = source.text.split('\n').map((p) => p.trim()).filter((p) => wordsOf(p).length >= MIN_PARAGRAPH_WORDS)
  // Some Grove text is JSON from a corrupted embed (`","_id":"0000…`): source-data pollution the converter flags and cannot keep as words.
  const POLLUTED = /"_id"\s*:|"_type"\s*:|data-state=/
  const pollutedParagraphs = paragraphs.filter((p) => POLLUTED.test(p))
  const missing = paragraphs.filter((p) => !POLLUTED.test(p) && !convSquash.includes(squash(p)))
  if (pollutedParagraphs.length) warn('source.polluted-text', `${pollutedParagraphs.length} paragraph(s) of corrupted embed JSON in Grove's own data`)
  const sourceWords = wordsOf(source.text).length
  const storyWords = wordsOf(conv.text).length
  if (sourceWords >= 5 && storyWords === 0) fail('body.empty', `the page has ${sourceWords} words; the story has none`)
  else if (missing.length > 0) fail('body.paragraph-missing', `${missing.length} of ${paragraphs.length} paragraphs: "${missing[0]!.slice(0, 70)}"`)
  else if (sourceWords >= 20 && storyWords / sourceWords < MIN_WORD_RATIO) fail('body.words-short', `${storyWords} of ${sourceWords} words`)

  // Pictures and audio: every file the page showed is a file the story will fetch.
  const have = new Set(story.assets.filter((a) => a.kind === 'image').flatMap((a) => [a.sourceUrl, noQuery(a.sourceUrl)]))
  const lostImages = source.imageUrls.filter((u) => !have.has(u) && !have.has(noQuery(u)))
  if (lostImages.length) fail('image.missing', `${lostImages.length} of ${source.imageUrls.length}: ${lostImages[0]}`)
  // A player's file may be audio or video (an .mp4 in an audio-style player): either kind of file kept is a kept file.
  const haveAudio = new Set(story.assets.filter((a) => a.kind === 'audio' || a.kind === 'video').map((a) => a.sourceUrl))
  const lostAudio = source.audioPlayers.filter((p) => !p.some((u) => haveAudio.has(u)))
  if (lostAudio.length) fail('audio.missing', `${lostAudio.length} of ${source.audioPlayers.length} players: ${lostAudio[0]![0]}`)

  // Links: advisory. A link the converter drops on purpose (a polluted address, an empty one) is reported by the converter itself.
  const haveLinks = new Set(conv.urls.map(linkKey))
  const lostLinks = [...new Set(source.hrefs.map(linkKey))].filter((k) => k && !haveLinks.has(k) && !k.startsWith('#') && !/^(mailto|tel)/i.test(k))
  if (lostLinks.length) warn('links.not-found', `${lostLinks.length}: ${lostLinks.slice(0, 3).join(', ')}`)

  const level: FidelityLevel = problems.some((p) => p.level === 'fail') ? 'fail' : problems.length ? 'warn' : 'pass'
  return { path: story.path, level, problems, sourceWords, storyWords, sourceImages: source.imageUrls.length, paragraphsMissing: missing.length }
}
