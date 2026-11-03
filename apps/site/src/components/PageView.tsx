import React from 'react'

import type { Page } from '@/payload-types'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { RenderHero } from '@/heros/RenderHero'
import { StandardPageView } from '@/components/Page/StandardPageView'

/** A standalone page. Rendered by the catch-all route for any path that belongs to a page, and for "/" (the home page). */
export function PageView({ page, draft, url }: { page: Pick<Page, 'hero' | 'layout'> & Partial<Pick<Page, 'template' | 'title' | 'summary' | 'body'>>; draft: boolean; url: string }) {
  const { hero, layout } = page
  // A standard page renders its own fields. A page made before templates existed has a layout and no body: it keeps rendering.
  const legacy = page.template === 'blocks' || (!page.body && Boolean(layout?.length))
  if (!legacy) return <StandardPageView draft={draft} page={{ title: page.title ?? '', summary: page.summary, body: page.body }} url={url} />
  return (
    <article className="pt-16 pb-24">
      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <RenderHero {...hero} />
      <RenderBlocks blocks={layout ?? []} />
    </article>
  )
}
