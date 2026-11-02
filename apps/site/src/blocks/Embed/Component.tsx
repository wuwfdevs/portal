import React from 'react'

import type { EmbedBlock as EmbedBlockProps } from '@/payload-types'

import { EMBED_REFERRER_POLICY, EMBED_SANDBOX, embedAllow, resolveEmbed } from '@/lib/embeds'
import { cn } from '@/utilities/ui'
import { getCachedGlobal } from '@/utilities/getGlobals'

const SHAPE_CLASS = { video: 'aspect-video', wide: 'aspect-[4/3]', audio: 'h-40' } as const

export const EmbedBlock: React.FC<EmbedBlockProps & { className?: string }> = async ({ url, title, caption, className }) => {
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
  return (
    <figure className={cn('not-prose my-8', className)}>
      <div className={cn('w-full overflow-hidden rounded-sm bg-surface-3', SHAPE_CLASS[embed.shape])}>
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
      </div>
      {caption && <figcaption className="mt-2 font-sans text-sm text-ink-3">{caption}</figcaption>}
    </figure>
  )
}
