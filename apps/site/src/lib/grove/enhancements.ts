// Grove's typed objects (a photo, a gallery, a quote, an audio player, a tweet, a video...) to our blocks. Every
// branch ends in one of three things: a block, a link with a report entry, or an explicit exception. Nothing falls
// through unseen.

import { absoluteUrl, durationSeconds, hostOf, plainText, type Ctx } from './context'
import { embedNode } from './embed'
import { htmlToNodes } from './html'
import * as lex from './lexical'
import type { AssetToken, BlockItem, Json, JsonObject, LexNode } from './types'

export const obj = (v: unknown): JsonObject | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : null)
export const arr = (v: unknown): Json[] => (Array.isArray(v) ? v : [])
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
export const template = (v: unknown): string => str(obj(v)?._template) ?? ''
const tname = (t: string): string => t.split('/').pop()?.replace(/\.hbs$/, '') ?? t
const intOf = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,6}$/.test(v) ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Plain text of a Grove string; says so when markup (bold, italic) had to be flattened. */
function plain(v: unknown, ctx: Ctx, what: string): string {
  const { text, hadMarkup } = plainText(str(v))
  if (hadMarkup && text) ctx.note('text.markup-flattened', what)
  return text
}

const ALIGN: Record<string, 'left' | 'center' | 'right'> = { 'align-left': 'left', 'align-center': 'center', 'align-right': 'right' }
function alignment(raw: unknown, ctx: Ctx): 'full' | 'left' | 'center' | 'right' {
  const a = str(raw)
  if (!a) return 'full'
  const mapped = ALIGN[a]
  if (!mapped) ctx.note('enhancement.unknown-alignment', a)
  return mapped ?? 'full'
}

// ---- pictures -------------------------------------------------------------------------------------------------

/** A Figure or Image as a media block's fields, or null when it has no picture (and the report says so). */
function pictureFields(fig: JsonObject, ctx: Ctx, align: 'full' | 'left' | 'center' | 'right'): Record<string, unknown> | null {
  const img = obj(fig.image)
  const sourceUrl = absoluteUrl(str(img?.src))
  if (!sourceUrl) {
    // Grove writes an empty lead figure for a story with no picture; that is nothing missing. A figure that says
    // something (a caption, a credit) but has no picture is.
    if (Object.keys(fig).every((k) => k === '_template' || k === '_styledTemplate')) ctx.note('figure.empty')
    else ctx.fail('figure.no-image', tname(template(fig)))
    return null
  }
  const alt = plain(fig.alt, ctx, 'alt text')
  const caption = plain(fig.caption, ctx, 'caption')
  const credit = plain(fig.credit, ctx, 'credit')
  const source = plain(fig.source, ctx, 'source')
  const token = ctx.asset({
    kind: 'image', sourceUrl,
    ...(intOf(img?.width) ? { width: intOf(img?.width)! } : {}), ...(intOf(img?.height) ? { height: intOf(img?.height)! } : {}),
    ...(alt ? { alt } : {}), ...(credit ? { credit } : {}), ...(source ? { source } : {}),
  })
  return { media: token, ...(caption ? { caption } : {}), ...(credit ? { credit } : {}), ...(source ? { source } : {}), ...(alt ? { altText: alt } : {}), alignment: align }
}

const FILENAME_TITLE = /\.(jpe?g|png|gif|webp|tiff?)$/i

/** A Carousel as a gallery block's fields. */
function galleryFields(c: JsonObject, ctx: Ctx): Record<string, unknown> | null {
  const images: Record<string, unknown>[] = []
  for (const s of arr(c.slides)) {
    const slide = obj(s)
    const media = arr(slide?.mediaContent).map(obj).find((m) => m && template(m).endsWith('/Image.hbs'))
    const img = obj(media?.image)
    const sourceUrl = absoluteUrl(str(img?.src))
    if (!slide || !media || !sourceUrl) {
      ctx.preserve('gallery.slide-without-picture')
      continue
    }
    const alt = plain(media.alt, ctx, 'alt text')
    const rawTitle = plain(slide.infoTitle, ctx, 'slide title')
    const title = rawTitle && !FILENAME_TITLE.test(rawTitle) ? rawTitle : ''
    if (rawTitle && !title) ctx.note('gallery.filename-title-dropped')
    const caption = plain(slide.infoDescription, ctx, 'slide caption')
    const credit = plain(slide.infoAttribution, ctx, 'slide credit')
    const token = ctx.asset({
      kind: 'image', sourceUrl,
      ...(intOf(img?.width) ? { width: intOf(img?.width)! } : {}), ...(intOf(img?.height) ? { height: intOf(img?.height)! } : {}),
      ...(alt ? { alt } : {}), ...(credit ? { credit } : {}),
    })
    images.push({ image: token, ...(title ? { title } : {}), ...(caption ? { caption } : {}), ...(credit ? { credit } : {}) })
  }
  if (!images.length) {
    ctx.fail('gallery.no-pictures')
    return null
  }
  const title = plain(c.title, ctx, 'gallery title')
  // A gallery's description arrives as nested objects; its text is kept, its structure is not.
  const description = arr(c.description).length ? plainText(JSON.stringify(c.description).replace(/<[^>]*>/g, ' ')).text : ''
  if (description) ctx.note('gallery.description-flattened')
  return { ...(title ? { title } : {}), layout: 'carousel', images }
}

// ---- audio ----------------------------------------------------------------------------------------------------

const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', aac: 'audio/aac' }

/** Register the audio of an HTML5AudioPlayer. Prefers the MP3; says so when other formats are left behind. */
export function audioToken(player: JsonObject, ctx: Ctx, meta: { title?: string; description?: string }): AssetToken | null {
  const sources = arr(player.sources).map(obj).filter((s): s is JsonObject => !!s && !!absoluteUrl(str(s.src)))
  if (!sources.length) {
    ctx.fail('audio.no-source')
    return null
  }
  const isMp3 = (s: JsonObject) => /mpeg|mp3/i.test(str(s.type) ?? '') || /\.mp3(\?|$)/i.test(str(s.src) ?? '')
  const chosen = sources.find(isMp3) ?? sources[0]!
  if (sources.length > 1) ctx.note('audio.other-formats-not-kept', sources.filter((s) => s !== chosen).map((s) => str(s.type) ?? hostOf(absoluteUrl(str(s.src))!)).join(', '))
  const sourceUrl = absoluteUrl(str(chosen.src))!
  const ext = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(sourceUrl)?.[1]?.toLowerCase() ?? ''
  const seconds = durationSeconds(player.duration)
  return ctx.asset({
    kind: 'audio', sourceUrl,
    ...(seconds ? { durationSeconds: seconds } : {}),
    ...(MIME[ext] ? { mimeType: MIME[ext] } : {}),
    ...(meta.title ? { title: meta.title } : {}), ...(meta.description ? { description: meta.description } : {}),
  })
}

// ---- the dispatcher -------------------------------------------------------------------------------------------

const oembedTitle = (html: string | undefined): string | undefined => {
  const m = /<iframe[^>]*\stitle="([^"]*)"/i.exec(html ?? '')
  return m ? plainText(m[1]).text || undefined : undefined
}
const oembedText = (html: string | undefined): string | undefined => {
  const m = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html ?? '')
  return m ? plainText(m[1]).text || undefined : undefined
}

/** One typed Grove object (found inside an Enhancement) to blocks. */
export function objectNodes(o: JsonObject, ctx: Ctx, align: 'full' | 'left' | 'center' | 'right'): LexNode[] {
  const t = template(o)
  const name = tname(t)
  switch (name) {
    case 'Figure':
    case 'Image': {
      const f = pictureFields(o, ctx, align)
      if (!f) return []
      ctx.count('block:mediaBlock')
      return [lex.block(ctx.id(), 'mediaBlock', f)]
    }
    case 'Carousel': {
      const f = galleryFields(o, ctx)
      if (!f) return []
      ctx.count('block:gallery')
      return [lex.block(ctx.id(), 'gallery', f)]
    }
    case 'AudioEnhancement': {
      const player = obj(arr(o.player)[0])
      const title = plain(o.title, ctx, 'audio title')
      const description = plain(o.description, ctx, 'audio description')
      const token = player ? audioToken(player, ctx, { title, description }) : null
      if (!token) return []
      const thumb = obj(arr(o.thumbnail).map(obj).find((x) => x)?.image)
      const thumbUrl = absoluteUrl(str(thumb?.src))
      const thumbnail = thumbUrl ? ctx.asset({ kind: 'image', sourceUrl: thumbUrl }) : undefined
      ctx.count('block:audioPlayer')
      return [lex.block(ctx.id(), 'audioPlayer', { audio: token, ...(title ? { title } : {}), ...(description ? { description } : {}), ...(thumbnail ? { thumbnail } : {}) })]
    }
    case 'QuoteEnhancement': {
      const quote = plain(o.quote, ctx, 'quote')
      const attribution = plain(o.attribution, ctx, 'quote attribution')
      if (!quote) {
        ctx.note('quote.empty')
        return []
      }
      if (o.pullQuote === true) {
        ctx.count('block:pullQuote')
        return [lex.block(ctx.id(), 'pullQuote', { text: quote, ...(attribution ? { attribution } : {}) })]
      }
      ctx.count('quote')
      return [lex.quote([lex.text(quote), ...(attribution ? [lex.linebreak(), lex.text(`— ${attribution}`)] : [])])]
    }
    case 'BlockQuote': {
      // Newer pages (2021 on) quote with `BlockQuote`: one string that holds the quotation and, after the closing mark, who said it.
      // The words are kept exactly as Grove has them; they are not split, because where the quotation ends is a guess.
      const quote = plain(o.quote, ctx, 'quote')
      if (!quote) {
        ctx.note('quote.empty')
        return []
      }
      ctx.count('quote')
      return [lex.quote([lex.text(quote)])]
    }
    case 'ModuleType': {
      const out: LexNode[] = []
      for (const c of arr(o.content)) {
        const m = obj(c)
        if (m && tname(template(m)) === 'IframeModule') {
          const e = embedNode(str(m.url) ?? '', ctx, { width: intOf(m.width), height: intOf(m.height) })
          if (e) out.push(e)
        } else ctx.fail('module.unknown-template', template(c) || 'no template')
      }
      return out
    }
    case 'YouTubeUrl':
    case 'FacebookUrl': {
      const e = embedNode(str(o.postUrl) ?? '', ctx, { ...(oembedTitle(str(o.oEmbed)) ? { title: oembedTitle(str(o.oEmbed))! } : {}) })
      return e ? [e] : []
    }
    case 'TweetUrl': {
      const caption = oembedText(str(o.oEmbed))
      const e = embedNode(str(o.postUrl) ?? '', ctx, caption ? { caption } : {})
      return e ? [e] : []
    }
    case 'ExternalContent':
      return htmlToNodes(str(o.oEmbed) ?? '', ctx)
    case 'PymInteractive':
      return htmlToNodes(str(o.html) ?? '', ctx)
    case 'VideoEnhancement': {
      const player = obj(arr(o.player)[0])
      const title = plain(o.title, ctx, 'video title')
      const caption = plain(o.caption, ctx, 'video caption')
      const pname = tname(template(player))
      if (pname === 'YouTubeVideoPlayer' || pname === 'VimeoVideoPlayer') {
        const id = str(player?.videoId)
        const url = pname === 'YouTubeVideoPlayer' ? `https://www.youtube.com/watch?v=${id}` : `https://vimeo.com/${id}`
        const e = id ? embedNode(url, ctx, { ...(title || str(player?.videoTitle) ? { title: title || str(player?.videoTitle)! } : {}), ...(caption ? { caption } : {}) }) : null
        return e ? [e] : []
      }
      if (pname === 'HTML5VideoPlayer') {
        const sources = arr(player?.sources).map(obj).filter((x): x is JsonObject => !!x && !!absoluteUrl(str(x.src)))
        if (!sources.length) {
          ctx.fail('video.no-source')
          return []
        }
        const isMp4 = (x: JsonObject) => /mp4/i.test(str(x.type) ?? '') || /\.mp4(\?|$)/i.test(str(x.src) ?? '')
        const chosen = sources.find(isMp4) ?? sources[0]!
        if (sources.length > 1) ctx.note('video.other-formats-not-kept', sources.filter((x) => x !== chosen).map((x) => str(x.type) ?? 'unknown type').join(', '))
        const sourceUrl = absoluteUrl(str(chosen.src))!
        const posterUrl = absoluteUrl(str(obj(player?.poster)?.src))
        const poster = posterUrl ? ctx.asset({ kind: 'image', sourceUrl: posterUrl }) : undefined
        const token = ctx.asset({ kind: 'video', sourceUrl, ...(str(chosen.type) ? { mimeType: str(chosen.type)! } : {}), ...(title ? { title } : {}) })
        ctx.count('block:videoPlayer')
        return [lex.block(ctx.id(), 'videoPlayer', { video: token, ...(title ? { title } : {}), ...(caption ? { caption } : {}), ...(poster ? { poster } : {}) })]
      }
      ctx.fail('video.unknown-player', pname || 'none')
      return []
    }
    default:
      ctx.fail('enhancement.unknown-template', t || 'no template')
      return []
  }
}

/** A body Enhancement: a wrapper holding one typed object, plus an alignment. */
export function enhancementNodes(e: JsonObject, ctx: Ctx): LexNode[] {
  const align = alignment(e.enhancementAlignment, ctx)
  const items = arr(e.item).map(obj)
  if (!items.length) {
    ctx.note('enhancement.empty')
    return []
  }
  const out: LexNode[] = []
  for (const it of items) {
    if (!it) {
      ctx.fail('enhancement.not-an-object')
      continue
    }
    out.push(...objectNodes(it, ctx, align))
  }
  return out
}

/** A story's featured media (Grove's `lead`): one picture, one gallery. Anything beyond the first is reported. */
export function leadItems(lead: Json[], ctx: Ctx): BlockItem[] {
  const items = lead.map(obj).filter((x): x is JsonObject => !!x)
  if (items.length > 1) ctx.preserve('lead.extra-items-not-kept', String(items.length - 1))
  const first = items[0]
  if (!first) return []
  const name = tname(template(first))
  if (name === 'Figure' || name === 'Image') {
    const f = pictureFields(first, ctx, 'full')
    if (!f) return []
    ctx.count('lead:mediaBlock')
    return [{ id: ctx.id(), blockType: 'mediaBlock', ...f }]
  }
  if (name === 'Carousel') {
    const f = galleryFields(first, ctx)
    if (!f) return []
    ctx.count('lead:gallery')
    return [{ id: ctx.id(), blockType: 'gallery', ...f }]
  }
  ctx.fail('lead.unknown-template', template(first) || 'no template')
  return []
}
