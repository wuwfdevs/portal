import React from 'react'

import type { Page } from '@/payload-types'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { RenderHero } from '@/heros/RenderHero'

/** A standalone page. Rendered by the catch-all route for any path that belongs to a page, and for "/" (the home page). */
export function PageView({ page, draft, url }: { page: Pick<Page, 'hero' | 'layout'>; draft: boolean; url: string }) {
  const { hero, layout } = page
  return (
    <article className="pt-16 pb-24">
      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <RenderHero {...hero} />
      <RenderBlocks blocks={layout} />
    </article>
  )
}
