// An embed as the story wants it: a block when the address resolves to something we show, otherwise a plain link
// (never nothing) and a report entry so a person can approve the host and run the page again.

import { resolveEmbed, type EmbedProvider } from '../embeds'
import { absoluteUrl, hostOf, type Ctx } from './context'
import * as lex from './lexical'
import type { LexNode } from './types'

const TITLE: Record<EmbedProvider, string> = {
  youtube: 'YouTube video',
  vimeo: 'Vimeo video',
  spotify: 'Spotify audio',
  'apple-podcasts': 'Apple Podcasts episode',
  soundcloud: 'SoundCloud audio',
  x: 'View the post on X',
  facebook: 'View the post on Facebook',
  custom: 'Embedded content',
}

export interface EmbedOptions {
  title?: string
  caption?: string
  width?: number
  height?: number
}

/** Facebook's plugin frames wrap the address of the post in an `href` parameter; the post is what we link to. */
function unwrapFacebookPlugin(url: string): string {
  try {
    const u = new URL(url)
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname.startsWith('/plugins/')) {
      const inner = u.searchParams.get('href')
      if (inner) return inner
    }
  } catch {
    /* not a URL; handled by the caller */
  }
  return url
}

export function embedNode(rawUrl: string, ctx: Ctx, opts: EmbedOptions = {}): LexNode | null {
  const abs = absoluteUrl(rawUrl)
  if (!abs) {
    ctx.preserve('embed.no-address', rawUrl.slice(0, 60))
    return null
  }
  const url = unwrapFacebookPlugin(abs)
  const result = resolveEmbed(url, ctx.embedHosts)
  if (!result.ok) {
    const host = hostOf(url)
    ctx.preserve(result.reason === 'host_not_allowed' ? 'embed.host-not-approved' : `embed.${result.reason.replace(/_/g, '-')}`, host)
    const label = opts.title ?? `Embedded content: ${host}`
    return lex.paragraph([lex.link(url, true, [lex.text(label)])])
  }
  const { provider } = result.embed
  const fields: Record<string, unknown> = { url, title: opts.title ?? (provider === 'custom' ? `Embedded content from ${hostOf(url)}` : TITLE[provider]) }
  if (opts.caption) fields.caption = opts.caption
  if (provider === 'custom') {
    if (opts.width && opts.width > 0 && opts.width <= 4000) fields.width = opts.width
    if (opts.height && opts.height > 0 && opts.height <= 4000) fields.height = opts.height
  }
  ctx.count('block:embed')
  ctx.count(`embed:${provider}`)
  return lex.block(ctx.id(), 'embed', fields)
}
