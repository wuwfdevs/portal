import React from 'react'

import type { Page } from '@/payload-types'

import { LivePreviewListener } from '@/components/LivePreviewListener'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import RichText from '@/components/RichText'

/** A standard page: a title, an optional short lead, and a body made of the same blocks a story can hold. */
export function StandardPageView({ page, draft, url }: { page: Pick<Page, 'title' | 'summary' | 'body'>; draft: boolean; url: string }) {
  return (
    <article className="pb-20">
      <PayloadRedirects disableNotFound url={url} />
      {draft && <LivePreviewListener />}
      <header className="container flex max-w-[52rem] flex-col gap-4 pt-8 md:pt-12">
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">{page.title}</h1>
        {page.summary && <p className="font-serif text-xl text-ink-2">{page.summary}</p>}
      </header>
      {page.body && (
        <div className="container mt-8 max-w-[52rem]">
          <RichText data={page.body} enableGutter={false} />
        </div>
      )}
    </article>
  )
}
