import type { Metadata } from 'next'

import { WaysView } from '@/components/Giving/WaysView'
import { groupViews, panelViews } from '@/lib/giving/content'
import { loadGiving } from '@/lib/giving/load'
import { GIVING_PATHS } from '@/lib/giving/paths'
import { selectWay } from '@/lib/giving/ways'
import { paragraphs } from '@/lib/page-content'

type Args = { searchParams: Promise<{ way?: string | string[] }> }

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadGiving()
  return {
    title: content.ways?.hero?.title || 'Other ways to give to WUWF',
    description: paragraphs(content.ways?.hero?.body)[0],
    alternates: { canonical: GIVING_PATHS.ways },
  }
}

// `?way=stock` opens one way to give. It is a plain link, so a way can be shared, and the page works without script.
export default async function OtherWaysRoute({ searchParams }: Args) {
  const [content, { way }] = await Promise.all([loadGiving(), searchParams])
  const requested = Array.isArray(way) ? way[0] : way
  const selection = selectWay(panelViews(content.ways), groupViews(content.ways), requested)
  return <WaysView content={content} selection={selection} />
}
