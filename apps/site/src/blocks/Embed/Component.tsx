import React from 'react'

import type { EmbedBlock as EmbedBlockProps } from '@/payload-types'

import { ClickToLoad } from '@/components/ClickToLoad'
import { EMBED_REFERRER_POLICY, EMBED_SANDBOX, embedAllow, resolveEmbed, type EmbedProvider } from '@/lib/embeds'
import { cn } from '@/utilities/ui'
import { getCachedGlobal } from '@/utilities/getGlobals'

const SHAPE_CLASS = { video: 'aspect-video', wide: 'aspect-[4/3]', audio: 'h-40' } as const
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'another site'
  }
}
const PROVIDER_NAME: Partial<Record<EmbedProvider, string>> = { x: 'X', facebook: 'Facebook' }

export const EmbedBlock: React.FC<EmbedBlockProps & { className?: string }> = async ({ url, title, caption, width, height, className }) => {
  const settings = await getCachedGlobal('site-settings', 0)()
  const result = resolveEmbed(url ?? '', (settings?.embedHosts ?? []).map((h) => h.host))

  // A record whose host was un-approved since it was saved renders as a plain link, never as a frame.
  if (!result.ok) {
    return url?.startsWith('https://') ? (
      <p className="not-prose my-6 font-sans text-base">
        <a className="font-semibold text-wuwf-blue-700 underline" href={url} rel="noopener noreferrer">
          {title || url}
        </a>
      </p>
    ) : null
  }
  const { embed } = result

  // A post on X or Facebook: a static card with the post's text and a link to the original. No frame, no script.
  if (embed.shape === 'link') {
    return (
      <figure className={cn('not-prose my-8', className)}>
        <blockquote className="flex flex-col gap-2 rounded-sm border border-rule bg-surface-2 p-4 font-sans">
          {caption && <p className="text-base text-ink-2">{caption}</p>}
          <p className="text-sm">
            <a className="font-semibold text-wuwf-blue-700 underline" href={embed.src} rel="noopener noreferrer">
              {title}
            </a>
            {!title.toLowerCase().includes((PROVIDER_NAME[embed.provider] ?? '').toLowerCase()) && (
              <span className="text-ink-3"> · {PROVIDER_NAME[embed.provider] ?? 'Original post'}</span>
            )}
          </p>
        </blockquote>
      </figure>
    )
  }

  // A page or widget with its original proportions keeps them; videos and audio players keep their standard shape.
  const keepsProportions = embed.provider === 'custom' && width && height
  const frame = (
    <iframe
      allow={embedAllow(embed.shape)}
      allowFullScreen={embed.shape !== 'audio'}
      className="size-full border-0"
      loading="lazy"
      referrerPolicy={EMBED_REFERRER_POLICY}
      sandbox={EMBED_SANDBOX}
      src={embed.src}
      title={title}
    />
  )
  return (
    <figure className={cn('not-prose my-8', className)}>
      <div
        className={cn('w-full overflow-hidden rounded-sm bg-surface-3', !keepsProportions && SHAPE_CLASS[embed.shape])}
        style={keepsProportions ? { aspectRatio: `${width} / ${height}` } : undefined}
      >
        {/* A site nobody approved loads only after the reader clicks: until then the frame is not on the page at all. */}
        {embed.load === 'click' ? (
          <ClickToLoad host={hostOf(embed.src)} title={title}>
            {frame}
          </ClickToLoad>
        ) : (
          frame
        )}
      </div>
      {caption && <figcaption className="mt-2 font-sans text-sm text-ink-3">{caption}</figcaption>}
    </figure>
  )
}
