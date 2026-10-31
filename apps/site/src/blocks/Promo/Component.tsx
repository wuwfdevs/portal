import configPromise from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import type { PromoBlock as PromoBlockProps } from '@/payload-types'

import { Media } from '@/components/Media'
import { cn } from '@/utilities/ui'

type Target = { relationTo: 'posts' | 'pages' | 'fellowships'; value: string | number | { id: string | number } }

const pathFor = (relationTo: Target['relationTo'], slug: string) =>
  relationTo === 'posts' ? `/posts/${slug}` : relationTo === 'fellowships' ? `/fellowships/${slug}` : `/${slug}`

export const PromoBlock: React.FC<PromoBlockProps & { className?: string }> = async ({ target, headline, description, image, className }) => {
  const t = target as Target | null
  if (!t) return null
  const id = typeof t.value === 'object' ? t.value.id : t.value

  // Looked up by id as the public: an unpublished or deleted target simply renders nothing.
  const payload = await getPayload({ config: configPromise })
  const doc = await payload
    .findByID({ collection: t.relationTo, id, depth: 1, overrideAccess: false, draft: false })
    .catch(() => null)
  if (!doc || !('slug' in doc) || !doc.slug) return null

  const d = doc as { slug: string; title?: string; summary?: string | null; meta?: { description?: string | null; image?: unknown } | null }
  const title = headline || d.title
  const text = description || d.summary || d.meta?.description || null
  const picture = (image && typeof image === 'object' ? image : null) ?? (d.meta?.image && typeof d.meta.image === 'object' ? d.meta.image : null)

  return (
    <article className={cn('not-prose relative my-8 flex flex-col overflow-hidden rounded-sm border border-rule bg-surface shadow-1 hover:shadow-2 sm:flex-row', className)}>
      {picture && (
        <div className="sm:w-56 sm:shrink-0">
          <Media imgClassName="size-full object-cover" resource={picture as never} />
        </div>
      )}
      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-serif text-xl font-bold leading-snug">
          <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700" href={pathFor(t.relationTo, d.slug)}>
            {title}
          </Link>
        </h3>
        {text && <p className="font-sans text-base text-ink-2">{text}</p>}
      </div>
    </article>
  )
}
